import {
  assessmentSchema,
  essayInputSchema,
  exerciseRequestSchema,
  reviewExerciseSchema,
  reviewGradeSchema,
  type Pattern,
  type ReviewExercise,
} from "./schema";
import { db } from "../db";
import { saveAssessment, saveReview } from "./persistence";
const base = () =>
  (import.meta.env.VITE_GRAMMAR_API_URL || "/api/grammar/grade").replace(
    /\/grammar\/grade\/?$/,
    "/writing",
  );
async function request(op: string, input: unknown): Promise<unknown> {
  const response = await fetch(`${base()}/${op}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw Error(
      typeof body.error === "string"
        ? body.error
        : "Writing chưa sẵn sàng. Bài làm vẫn được giữ.",
    );
  }
  return response.json();
}
export async function assessWriting(input: unknown) {
  const parsed = essayInputSchema.parse(input),
    a = assessmentSchema.parse(await request("assess", parsed));
  if (
    a.id !== parsed.essayId ||
    a.originalEssay !== parsed.essay ||
    a.prompt !== parsed.prompt ||
    a.task !== parsed.task
  )
    throw Error("Assessment không khớp bài gốc.");
  await saveAssessment(a);
  return a;
}
export async function getReviewExercise(pattern: Pattern, level: number) {
  const outcomes = new Set(
    (
      await db.writingOutcomes.where("patternId").equals(pattern.id).toArray()
    ).map((o) => o.exerciseId),
  );
  const cached = (
    await db.writingExercises.where("patternId").equals(pattern.id).toArray()
  ).find(
    (e) => e.level === level && e.expiresAt > Date.now() && !outcomes.has(e.id),
  );
  if (cached) return cached;
  const minimal = {
    ...pattern,
    evidenceIds: pattern.evidenceIds.slice(-20),
    essayIds: pattern.essayIds.slice(-20),
    originalExamples: pattern.originalExamples.slice(-3),
    successfulContexts: pattern.successfulContexts.slice(-20),
    successfulDays: pattern.successfulDays.slice(-20),
  };
  const exercise = reviewExerciseSchema.parse(
    await request(
      "exercise",
      exerciseRequestSchema.parse({
        patternId: pattern.id,
        level,
        pattern: minimal,
        recentContexts: (
          await db.writingExercises
            .where("patternId")
            .equals(pattern.id)
            .toArray()
        )
          .slice(-12)
          .map((e) => e.context),
      }),
    ),
  );
  if (exercise.patternId !== pattern.id || exercise.level !== level)
    throw Error("Bài ôn không khớp yêu cầu.");
  await db.writingExercises.put(exercise);
  return exercise;
}
export async function gradeReview(exercise: ReviewExercise, answer: string) {
  const result = reviewGradeSchema.parse(
    await request("grade", { id: exercise.id, token: exercise.token, answer }),
  );
  if (result.exerciseId !== exercise.id || result.answer !== answer)
    throw Error("Phản hồi không khớp câu trả lời.");
  await saveReview(exercise, result);
  return result;
}
