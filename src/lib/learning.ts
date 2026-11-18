import { db, resolveAttempt, type Attempt } from "./db";
import { foundationQuestions, questionById, grade, shuffle } from "./content";
import { canStudy, lessonById } from "./foundation";
import {
  nextStage,
  stages,
  type Stage,
  type LearningProgress,
} from "./learning-model";
const day = 86400000;
export async function startLesson(id: string, now = Date.now()) {
  return db.transaction("rw", db.lessons, async () => {
    if (!canStudy(id, await db.lessons.toArray()))
      throw Error("Study the prerequisite theory first.");
    const p = await db.lessons.get(id);
    if (p) return p;
    const row: LearningProgress = { id, startedAt: now, completed: [] };
    await db.lessons.add(row);
    return row;
  });
}
export async function completeTheory(
  id: string,
  stage: "learn" | "understand",
  now = Date.now(),
) {
  await startLesson(id, now);
  const p = (await db.lessons.get(id))!;
  if (p.completed.includes(stage)) return;
  if (nextStage(p) !== stage)
    throw Error("Complete the preceding stage first.");
  await db.lessons.put({ ...p, completed: [...p.completed, stage] });
}
export function stageQuestions(id: string, stage: Stage) {
  return foundationQuestions.filter(
    (q) => q.lesson_id === id && q.learning_stage === stage,
  );
}
async function advanceStage(id: string, stage: Stage, now: number) {
  const p = await db.lessons.get(id);
  if (!p || p.completed.includes(stage) || nextStage(p) !== stage) return;
  const history = (await db.attempts.toArray()).filter(
    (a) =>
      a.lessonId === id &&
      a.learningStage === stage &&
      !a.checkId &&
      (stage !== "review" || a.date >= (p.reviewDueAt ?? Infinity)),
  );
  const latest = new Map(
    history
      .sort((a, b) => (a.reviewedAt ?? a.date) - (b.reviewedAt ?? b.date))
      .map((a) => [a.questionId, a]),
  );
  const pool = stageQuestions(id, stage);
  if (pool.length && pool.every((q) => latest.get(q.id)?.result === "correct"))
    await db.lessons.put({
      ...p,
      completed: [...p.completed, stage],
      ...(stage === "apply" ? { reviewDueAt: now + day } : {}),
    });
}
export async function recordLearningAnswer(
  questionId: string,
  answer: string,
  options: { checkId?: string; now?: number } = {},
) {
  const now = options.now ?? Date.now();
  const q = questionById.get(questionId);
  if (!q?.lesson_id || !q.learning_stage || !answer.trim())
    throw Error("Invalid lesson response.");
  const stage = q.learning_stage;
  let target = q.lesson_id;
  if (options.checkId) {
    const check = await db.checks.get(options.checkId);
    if (!check || check.finishedAt || !check.questionIds.includes(q.id))
      throw Error("This check does not accept this question.");
    target = check.lessonId;
  } else if (stage === "mastery") throw Error("Start a mastery check first.");
  const p = await startLesson(target, now);
  if (!options.checkId && stages.indexOf(stage) > stages.indexOf(nextStage(p)))
    throw Error("Complete the preceding learning stage first.");
  if (
    stage === "review" &&
    !p.completed.includes("review") &&
    now < (p.reviewDueAt ?? Infinity)
  )
    throw Error(
      "This review is not due yet. Revisit the theory while you wait.",
    );
  const result = grade(q, answer);
  const a: Attempt = {
    questionId: q.id,
    family: q.family,
    type: q.type,
    answer,
    result,
    date: now,
    lessonId: target,
    learningStage: stage,
    checkId: options.checkId,
  };
  await db.transaction(
    "rw",
    db.attempts,
    db.lessons,
    db.writing,
    db.checks,
    async () => {
      if (options.checkId) {
        const current = await db.checks.get(options.checkId);
        if (!current || current.finishedAt)
          throw Error("This mastery check is already complete.");
        if (
          (await db.attempts.toArray()).some(
            (old) => old.checkId === options.checkId && old.questionId === q.id,
          )
        )
          throw Error(
            "This question was already submitted in this check. Continue or review the saved answer.",
          );
      }
      await db.attempts.add(a);
      if (stage === "apply")
        await db.writing.add({
          text: answer,
          original: q.prompt,
          applied: false,
          date: now,
        });
      if (
        stage === "review" &&
        result === "incorrect" &&
        !p.completed.includes("review")
      )
        await db.lessons.put({ ...p, reviewDueAt: now + day });
      await advanceStage(target, stage, now);
    },
  );
  return result;
}
export async function syncLearningAttempt(id: number, now = Date.now()) {
  const a = await db.attempts.get(id);
  if (a?.lessonId && a.learningStage && !a.checkId)
    await advanceStage(a.lessonId, a.learningStage, now);
}
export async function verifyLearningAnswer(
  id: number,
  correct: boolean,
  now = Date.now(),
) {
  await resolveAttempt(id, correct ? "correct" : "incorrect");
  await syncLearningAttempt(id, now);
}
export async function beginMastery(id: string, now = Date.now()) {
  if (!lessonById.get(id)?.available)
    throw Error("This lesson has no activated mastery content.");
  const p = await db.lessons.get(id);
  if (!p?.completed.includes("review"))
    throw Error("Complete application and the due review before mastery.");
  const existing = (
    await db.checks.where("lessonId").equals(id).toArray()
  ).sort((a, b) => b.startedAt - a.startedAt);
  if (p.masteredAt !== undefined) {
    const passed = existing.find((c) => c.passed);
    if (passed) return passed;
    throw Error("Mastery check history is missing.");
  }
  const open = existing.find((c) => !c.finishedAt);
  if (open) return open;
  const failed = existing.find((c) => c.passed === false);
  if (failed && now < failed.finishedAt! + day)
    throw Error(
      "Revisit the lesson and return tomorrow for a fresh mastery check.",
    );
  const learned = (await db.lessons.toArray())
    .filter((x) => x.completed.includes("review"))
    .map((x) => x.id);
  const own = shuffle(stageQuestions(id, "mastery"));
  const otherGroups = learned
    .filter((x) => x !== id)
    .map((x) => shuffle(stageQuestions(x, "mastery")));
  const chosen = [
    ...own.slice(0, 2),
    ...otherGroups.map((g) => g[0]).filter(Boolean),
  ];
  const rest = shuffle([
    ...own.slice(2),
    ...otherGroups.flatMap((g) => g.slice(1)),
  ]);
  const questionIds = [...chosen, ...rest].slice(0, 6).map((q) => q.id);
  if (questionIds.length !== 6)
    throw Error("There are not enough authored mastery questions.");
  const check = {
    id: crypto.randomUUID(),
    lessonId: id,
    questionIds,
    startedAt: now,
  };
  await db.checks.add(check);
  return check;
}
export async function finishMastery(checkId: string, now = Date.now()) {
  return db.transaction("rw", db.attempts, db.lessons, db.checks, async () => {
    const check = await db.checks.get(checkId);
    if (!check) throw Error("Check not found.");
    if (check.finishedAt) return check;
    if (
      !lessonById.get(check.lessonId)?.available ||
      check.questionIds.some(
        (id) => questionById.get(id)?.learning_stage !== "mastery",
      )
    )
      throw Error("Invalid or unavailable mastery content.");
    const latest = new Map(
      (await db.attempts.toArray())
        .filter((a) => a.checkId === checkId)
        .sort((a, b) => a.date - b.date)
        .map((a) => [a.questionId, a]),
    );
    if (
      check.questionIds.some(
        (id) => !latest.has(id) || latest.get(id)?.result === "review",
      )
    )
      throw Error(
        "Answer every question and resolve pending reviews before finishing.",
      );
    const score =
      (100 *
        check.questionIds.filter((id) => latest.get(id)?.result === "correct")
          .length) /
      check.questionIds.length;
    const passed = score >= 80;
    const result = { ...check, finishedAt: now, score, passed };
    await db.checks.put(result);
    const p = await db.lessons.get(check.lessonId);
    if (!p?.completed.includes("review"))
      throw Error("Review must be completed first.");
    await db.lessons.put(
      passed
        ? {
            ...p,
            completed: [...new Set([...p.completed, "mastery" as const])],
            masteredAt: now,
          }
        : {
            ...p,
            completed: p.completed.filter(
              (s) => s !== "review" && s !== "mastery",
            ),
            reviewDueAt: now + day,
          },
    );
    return result;
  });
}
export function ruleFeedback(ids: string[]) {
  return ids.map((id) => lessonById.get(id)).filter(Boolean);
}
