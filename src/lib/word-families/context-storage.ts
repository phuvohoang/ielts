import { db } from "../db";
import { shuffle, normalize, type Family, type Selection } from "./model";
import {
  contextRevision,
  contextResponseSchema,
  contextRunSchema,
  cachedContextSchema,
  validateContextQuestion,
  planContext,
  eligibleContextFamilies,
  contextIncorrectIds,
  fingerprint,
  type ContextRun,
  type ContextSettings,
  type CachedContext,
  type ContextTask,
} from "./context-model";
export async function loadContextRuns() {
  return (
    await db.wordContextRuns.orderBy("updatedAt").reverse().toArray()
  ).map((v) => contextRunSchema.parse(v));
}
export async function contextSource(
  settings: ContextSettings,
  allowedIds?: Set<string>,
) {
  return db.transaction(
    "r",
    db.wordFamilies,
    db.wordFamilySelections,
    db.wordContextRuns,
    async () => {
      const families = await db.wordFamilies.toArray();
      const selections: Selection[] = await db.wordFamilySelections.toArray();
      const selected = new Set(selections.map((s) => s.familyId));
      const incorrect = contextIncorrectIds(
        await db.wordContextRuns.toArray(),
        families,
      );
      return eligibleContextFamilies(
        families.filter(
          (f) =>
            (!allowedIds || allowedIds.has(f.id)) &&
            (settings.source === "all" ||
              (settings.source === "selected" ? selected : incorrect).has(
                f.id,
              )),
        ),
        settings.target,
      );
    },
  );
}
async function requestBatch(tasks: ContextTask[], avoid: string[]) {
  const url = (
    import.meta.env.VITE_GRAMMAR_API_URL || "/api/grammar/grade"
  ).replace(/\/grammar\/grade\/?$/, "/word-families/context");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tasks, avoid }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw Error(
      typeof body.error === "string"
        ? body.error
        : "Chưa tạo được câu hỏi. Hãy thử lại.",
    );
  }
  return contextResponseSchema.parse(await response.json());
}
function taskFor(item: CachedContext, family: Family): ContextTask {
  return {
    family,
    difficulty: item.difficulty,
    options: item.question.options,
    target_pos: item.question.target_pos,
    correct_answer: item.question.correct_answer,
  };
}
export async function generateContextRun(
  settings: ContextSettings,
  progress: (done: number, total: number) => void,
  allowedIds?: Set<string>,
  fresh = false,
  exclude: string[] = [],
) {
  const families = await contextSource(settings, allowedIds);
  const plan = planContext(families, settings);
  const saved = fresh ? [] : shuffle(await db.wordContextCache.toArray());
  const result: (CachedContext | undefined)[] = Array(plan.length).fill(
    undefined,
  );
  const used = new Set(exclude.map(normalize));
  const avoid = () =>
    [
      ...exclude,
      ...result.flatMap((x) => (x ? [x.question.sentence] : [])),
    ].slice(-50);
  for (let i = 0; i < plan.length; i++) {
    const task = plan[i];
    for (const raw of saved) {
      const parsed = cachedContextSchema.safeParse(raw);
      if (!parsed.success) continue;
      const item = parsed.data;
      if (
        item.revision !== contextRevision ||
        item.family.id !== task.family.id ||
        fingerprint(item.family) !== fingerprint(task.family) ||
        item.difficulty !== task.difficulty ||
        item.question.target_pos !== task.target_pos ||
        used.has(normalize(item.question.sentence))
      )
        continue;
      try {
        validateContextQuestion(item.question, taskFor(item, task.family));
      } catch {
        continue;
      }
      result[i] = {
        ...item,
        question: { ...item.question, options: shuffle(item.question.options) },
      };
      used.add(normalize(item.question.sentence));
      break;
    }
  }
  progress(result.filter(Boolean).length, plan.length);
  const pending = plan.flatMap((_, i) => (result[i] ? [] : [i]));
  for (let start = 0; start < pending.length; start += 5) {
    const indices = pending.slice(start, start + 5),
      tasks = indices.map((i) => plan[i]);
    const response = await requestBatch(tasks, avoid());
    if (response.questions.length !== tasks.length)
      throw Error("Số câu trả về không khớp. Thử lại để dùng cache đã lưu.");
    const batch: CachedContext[] = [];
    for (let j = 0; j < tasks.length; j++) {
      const task = tasks[j];
      const question = validateContextQuestion(response.questions[j], task, [
        ...avoid(),
        ...batch.map((x) => x.question.sentence),
      ]);
      if (used.has(normalize(question.sentence)))
        throw Error("Câu bị lặp lại. Hãy thử tạo ngữ cảnh khác.");
      // Time stamps record cache creation, never render keys.
      batch.push(
        cachedContextSchema.parse({
          id: crypto.randomUUID(),
          revision: contextRevision,
          family: task.family,
          difficulty: task.difficulty,
          question: { ...question, options: shuffle(question.options) },
          createdAt: Date.now(),
        }),
      );
    }
    await db.wordContextCache.bulkPut(batch);
    batch.forEach((item, j) => {
      result[indices[j]] = item;
      used.add(normalize(item.question.sentence));
    });
    progress(result.filter(Boolean).length, plan.length);
  }
  const items = result.flatMap((x) => (x ? [x] : []));
  if (items.length !== settings.count)
    throw Error("Chưa đủ câu hợp lệ. Hãy thử lại.");
  const now = Date.now();
  const run = contextRunSchema.parse({
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    settings,
    index: 0,
    completed: false,
    questions: shuffle(items).map((item) => ({ item })),
  });
  await db.transaction(
    "rw",
    db.wordFamilies,
    db.wordFamilySelections,
    db.wordContextRuns,
    async () => {
      // Selection/library may change in another tab while Gemini is working.
      const current = new Map(
        (await contextSource(settings, allowedIds)).map((f) => [
          f.id,
          fingerprint(f),
        ]),
      );
      if (families.some((f) => current.get(f.id) !== fingerprint(f)))
        throw Error(
          "Thư viện hoặc lựa chọn đã thay đổi khi đang tạo câu. Hãy tạo lại từ nguồn hiện tại.",
        );
      await db.wordContextRuns.put(run);
    },
  );
  const stale = await db.wordContextCache
    .orderBy("createdAt")
    .reverse()
    .offset(500)
    .primaryKeys();
  await db.wordContextCache.bulkDelete(stale);
  return run;
}
export async function answerContext(id: string, index: number, answer: string) {
  return db.transaction("rw", db.wordContextRuns, async () => {
    const run = contextRunSchema.parse(await db.wordContextRuns.get(id));
    const q = run.questions[index];
    if (
      run.completed ||
      index !== run.index ||
      !q ||
      q.answer !== undefined ||
      !q.item.question.options.includes(answer)
    )
      return run;
    q.answer = answer;
    q.answeredAt = Date.now();
    run.updatedAt = q.answeredAt;
    await db.wordContextRuns.put(contextRunSchema.parse(run));
    return run;
  });
}
export async function nextContext(id: string) {
  return db.transaction("rw", db.wordContextRuns, async () => {
    const run = contextRunSchema.parse(await db.wordContextRuns.get(id));
    if (run.questions[run.index].answer === undefined || run.completed)
      return run;
    if (run.index === run.questions.length - 1) run.completed = true;
    else run.index++;
    run.updatedAt = Date.now();
    await db.wordContextRuns.put(run);
    return run;
  });
}
export async function retryContext(run: ContextRun, incorrectOnly: boolean) {
  const eligible = new Map(
    (await contextSource(run.settings)).map((f) => [f.id, fingerprint(f)]),
  );
  const questions = run.questions.filter(
    (q) =>
      eligible.get(q.item.family.id) === fingerprint(q.item.family) &&
      (!incorrectOnly ||
        (q.answer !== undefined &&
          normalize(q.answer) !== normalize(q.item.question.correct_answer))),
  );
  if (!questions.length)
    throw Error(
      "Không còn câu phù hợp với thư viện và nguồn từ hiện tại để làm lại.",
    );
  const now = Date.now();
  const retry = contextRunSchema.parse({
    ...run,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    index: 0,
    completed: false,
    questions: shuffle(questions).map((q) => ({
      item: {
        ...q.item,
        question: {
          ...q.item.question,
          options: shuffle(q.item.question.options),
        },
      },
    })),
  });
  await db.wordContextRuns.put(retry);
  return retry;
}
