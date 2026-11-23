// Clock reads are persisted progress timestamps and review/expiry decisions, never render IDs.
import { z } from "zod";
import { db } from "../db";
import {
  gradeSchema,
  sessionSchema,
  curriculumRunSchema,
  curriculumProgressSchema,
  type CurriculumSession,
} from "./schema";
const base = () =>
  (import.meta.env.VITE_GRAMMAR_API_URL || "/api/grammar/grade").replace(
    /\/grammar\/grade\/?$/,
    "/curriculum",
  );
async function request(op: string, data: unknown) {
  const response = await fetch(`${base()}/${op}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(210000),
  });
  if (!response.ok)
    throw Error("Chưa hoàn tất bài luyện. Bài làm vẫn được giữ; hãy thử lại.");
  return response.json();
}
export async function generateLesson(unitId: string, patternIds: string[]) {
  const session = sessionSchema.parse(
    await request("generate", { unitId, patternIds }),
  );
  if (
    session.unitId !== unitId ||
    [...session.patternIds].sort().join() !== [...patternIds].sort().join() ||
    session.questions.some(
      (q) =>
        q.testedPatternIds.some((id) => !patternIds.includes(id)) ||
        !Object.values(q.validation.checks).every(Boolean),
    )
  )
    throw Error("Bộ câu hỏi không khớp bài học.");
  const run = curriculumRunSchema.parse({
    ...session,
    answers: {},
    results: {},
    updatedAt: Date.now(),
  });
  await db.curriculumRuns.put(run);
  return run;
}
export async function saveLessonAnswer(
  runId: string,
  questionId: string,
  answer: string,
) {
  if (answer.length > 8000) throw Error("Tối đa 8.000 ký tự.");
  await db.transaction("rw", db.curriculumRuns, async () => {
    const run = await db.curriculumRuns.get(runId);
    if (!run || !run.questions.some((q) => q.id === questionId))
      throw Error("Không tìm thấy câu hỏi.");
    if (run.results[questionId]) return;
    run.answers[questionId] = answer;
    run.updatedAt = Date.now();
    await db.curriculumRuns.put(run);
  });
}
export async function saveLessonGrade(
  session: CurriculumSession,
  input: z.infer<typeof gradeSchema>,
  now = Date.now(),
) {
  const result = gradeSchema.parse(input);
  const q = session.questions.find((q) => q.id === result.questionId);
  if (!q) throw Error("Phản hồi không thuộc bài luyện.");
  return db.transaction(
    "rw",
    db.curriculumRuns,
    db.curriculumProgress,
    async () => {
      const run = await db.curriculumRuns.get(session.id);
      if (!run || run.answers[q.id]?.trim() !== result.answer)
        throw Error("Phản hồi không khớp bài làm.");
      if (run.results[q.id]) return;
      run.results[q.id] = result;
      run.updatedAt = now;
      await db.curriculumRuns.put(run);
      if (result.status === "needs_review" || result.confidence < 0.8) return;
      for (const id of q.testedPatternIds) {
        const old = await db.curriculumProgress.get(id);
        if (old?.completedQuestionIds.includes(q.id)) continue;
        const success =
          result.status === "correct" && result.demonstratesPattern;
        if (result.status === "correct" && !result.demonstratesPattern)
          continue;
        const due = !old || old.dueAt <= now;
        const streak = success ? (old?.streak ?? 0) + (due ? 1 : 0) : 0;
        const intervalDays = success
          ? due
            ? [1, 3, 7, 14, 30, 60][Math.min(streak - 1, 5)]
            : old!.intervalDays
          : 1;
        await db.curriculumProgress.put(
          curriculumProgressSchema.parse({
            id,
            streak,
            intervalDays,
            dueAt: success && !due ? old!.dueAt : now + intervalDays * 86400000,
            correct: (old?.correct ?? 0) + (success ? 1 : 0),
            incorrect: (old?.incorrect ?? 0) + (success ? 0 : 1),
            completedQuestionIds: [...(old?.completedQuestionIds ?? []), q.id],
            updatedAt: now,
          }),
        );
      }
    },
  );
}
export async function gradeLesson(
  session: CurriculumSession,
  questionId: string,
  answer: string,
) {
  await saveLessonAnswer(session.id, questionId, answer);
  const result = gradeSchema.parse(
    await request("grade", {
      id: session.id,
      token: session.token,
      questionId,
      answer: answer.trim(),
    }),
  );
  if (result.questionId !== questionId || result.answer !== answer.trim())
    throw Error("Phản hồi không khớp câu trả lời.");
  await saveLessonGrade(session, result);
  return result;
}
