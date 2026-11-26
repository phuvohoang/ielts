import { z } from "zod";
import {
  familySchema,
  parts,
  normalize,
  englishKey,
  shuffle,
  type Family,
  type Part,
} from "./model";
export const contextRevision = 1;
export const levels = ["B1", "B2", "C1"] as const;
export const contextSettingsSchema = z
  .object({
    count: z.union([
      z.literal(5),
      z.literal(10),
      z.literal(20),
      z.literal(30),
      z.literal(50),
    ]),
    difficulty: z.enum([...levels, "Mixed"]),
    target: z.enum(["all", ...parts]),
    source: z.enum(["all", "selected", "incorrect"]),
  })
  .strict();
export type ContextSettings = z.infer<typeof contextSettingsSchema>;
export const contextQuestionSchema = z
  .object({
    word_family_id: z.string().uuid(),
    sentence: z.string().trim().min(15).max(700),
    options: z.array(z.string().trim().min(1).max(120)).min(2).max(4),
    correct_answer: z.string().trim().min(1).max(120),
    target_pos: z.enum(parts),
    explanation_vi: z.string().trim().min(25).max(1800),
    translation_vi: z.string().trim().min(10).max(1000),
  })
  .strict();
export type ContextQuestion = z.infer<typeof contextQuestionSchema>;
export const contextResponseSchema = z
  .object({ questions: z.array(contextQuestionSchema).min(1).max(5) })
  .strict();
export const contextTaskSchema = z
  .object({
    family: familySchema,
    target_pos: z.enum(parts),
    correct_answer: z.string().min(1).max(120),
    options: z.array(z.string().min(1).max(120)).min(2).max(4),
    difficulty: z.enum(levels),
  })
  .strict();
export type ContextTask = z.infer<typeof contextTaskSchema>;
export const contextRequestSchema = z
  .object({
    tasks: z.array(contextTaskSchema).min(1).max(5),
    avoid: z.array(z.string().max(700)).max(50),
  })
  .strict();
export function fingerprint(family: Family) {
  return JSON.stringify([
    normalize(family.data.meaning_vi),
    englishKey(family.data),
  ]);
}
// Keep one distinct option per available POS. Exclude homographs shared with a
// different POS: a spelling alone cannot distinguish their grammatical roles.
export function contextChoices(family: Family) {
  return parts.flatMap((part) => {
    const accepted = family.data[part].filter(
      (word) =>
        !parts.some(
          (other) =>
            other !== part &&
            family.data[other].some((w) => normalize(w) === normalize(word)),
        ),
    );
    return accepted.length ? [{ part, accepted }] : [];
  });
}
export function eligibleContextFamilies(
  families: Family[],
  target: ContextSettings["target"],
) {
  return families.filter((f) => {
    const choices = contextChoices(f);
    return (
      choices.length >= 2 &&
      (target === "all" || choices.some((c) => c.part === target))
    );
  });
}
export function planContext(
  families: Family[],
  settings: ContextSettings,
): ContextTask[] {
  const eligible = shuffle(eligibleContextFamilies(families, settings.target));
  if (!eligible.length)
    throw Error(
      "Không có họ từ đủ ít nhất hai từ loại phân biệt cho lựa chọn này.",
    );
  const familyCounts = new Map<string, number>(),
    posCounts = new Map<Part, number>();
  return Array.from({ length: settings.count }, (_, index) => {
    const family = [...eligible].sort(
      (a, b) => (familyCounts.get(a.id) ?? 0) - (familyCounts.get(b.id) ?? 0),
    )[0];
    familyCounts.set(family.id, (familyCounts.get(family.id) ?? 0) + 1);
    const choices = contextChoices(family);
    const candidates = shuffle(
      choices.filter(
        (c) => settings.target === "all" || c.part === settings.target,
      ),
    );
    candidates.sort(
      (a, b) => (posCounts.get(a.part) ?? 0) - (posCounts.get(b.part) ?? 0),
    );
    const selected = candidates[0];
    posCounts.set(selected.part, (posCounts.get(selected.part) ?? 0) + 1);
    const correct = shuffle(selected.accepted)[0];
    return {
      family,
      target_pos: selected.part,
      correct_answer: correct,
      options: shuffle(
        choices.map((c) =>
          c.part === selected.part ? correct : shuffle(c.accepted)[0],
        ),
      ),
      difficulty:
        settings.difficulty === "Mixed"
          ? levels[index % levels.length]
          : settings.difficulty,
    };
  });
}
export function validateContextQuestion(
  raw: unknown,
  task: ContextTask,
  avoid: string[] = [],
): ContextQuestion {
  const q = contextQuestionSchema.parse(raw);
  const choices = contextChoices(task.family);
  const optionKeys = q.options.map(normalize);
  const blanks = q.sentence.match(/_{2,}/g) ?? [];
  if (
    q.word_family_id !== task.family.id ||
    q.target_pos !== task.target_pos ||
    normalize(q.correct_answer) !== normalize(task.correct_answer) ||
    !task.family.data[q.target_pos].some(
      (w) => normalize(w) === normalize(q.correct_answer),
    ) ||
    !optionKeys.includes(normalize(q.correct_answer)) ||
    new Set(optionKeys).size !== optionKeys.length ||
    optionKeys.length !== task.options.length ||
    task.options.some((w) => !optionKeys.includes(normalize(w))) ||
    choices.length !== q.options.length ||
    choices.some(
      (c) =>
        q.options.filter((w) =>
          c.accepted.some((a) => normalize(a) === normalize(w)),
        ).length !== 1,
    ) ||
    blanks.length !== 1 ||
    blanks[0] !== "_____" ||
    avoid.some((s) => normalize(s) === normalize(q.sentence))
  )
    throw Error(
      "Câu hỏi không khớp thư viện, kế hoạch hoặc cấu trúc cho phép.",
    );
  return q;
}
export const cachedContextSchema = z
  .object({
    id: z.string(),
    revision: z.literal(contextRevision),
    family: familySchema,
    difficulty: z.enum(levels),
    question: contextQuestionSchema,
    createdAt: z.number(),
  })
  .strict()
  .superRefine((item, ctx) => {
    try {
      validateContextQuestion(item.question, {
        family: item.family,
        difficulty: item.difficulty,
        target_pos: item.question.target_pos,
        correct_answer: item.question.correct_answer,
        options: item.question.options,
      });
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Cached question does not match its word family.",
      });
    }
  });
export type CachedContext = z.infer<typeof cachedContextSchema>;
export const contextRunSchema = z
  .object({
    id: z.string().uuid(),
    createdAt: z.number(),
    updatedAt: z.number(),
    settings: contextSettingsSchema,
    index: z.number().int().min(0),
    completed: z.boolean(),
    questions: z
      .array(
        z
          .object({
            item: cachedContextSchema,
            answer: z.string().optional(),
            answeredAt: z.number().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .refine(
    (r) =>
      r.index < r.questions.length &&
      (!r.completed || r.questions.every((q) => q.answer !== undefined)) &&
      r.questions.every(
        (q) =>
          q.answer === undefined || q.item.question.options.includes(q.answer),
      ) &&
      new Set(r.questions.map((q) => normalize(q.item.question.sentence)))
        .size === r.questions.length,
    "Phiên Word Formation in Context không hợp lệ.",
  );
export type ContextRun = z.infer<typeof contextRunSchema>;
export function contextCorrect(question: ContextRun["questions"][number]) {
  return (
    question.answer !== undefined &&
    normalize(question.answer) ===
      normalize(question.item.question.correct_answer)
  );
}
export function contextSummary(run: ContextRun) {
  const answered = run.questions.filter((q) => q.answer !== undefined);
  const score = answered.filter(contextCorrect).length;
  return {
    score,
    total: run.questions.length,
    accuracy: Math.round((score / run.questions.length) * 100),
    incorrect: answered.filter((q) => !contextCorrect(q)),
    byPart: parts.map((part) => {
      const rows = answered.filter((q) => q.item.question.target_pos === part);
      return {
        part,
        score: rows.filter(contextCorrect).length,
        total: rows.length,
      };
    }),
  };
}
export function contextIncorrectIds(runs: ContextRun[], families: Family[]) {
  const current = new Map(families.map((f) => [f.id, fingerprint(f)]));
  const latest = new Map<string, { id: string; wrong: boolean; at: number }>();
  for (const run of runs)
    for (const q of run.questions) {
      if (
        q.answer === undefined ||
        current.get(q.item.family.id) !== fingerprint(q.item.family)
      )
        continue;
      const key = `${q.item.family.id}:${q.item.question.target_pos}`,
        at = q.answeredAt ?? run.updatedAt;
      if ((latest.get(key)?.at ?? -1) <= at)
        latest.set(key, {
          id: q.item.family.id,
          wrong: !contextCorrect(q),
          at,
        });
    }
  return new Set([...latest.values()].filter((v) => v.wrong).map((v) => v.id));
}
