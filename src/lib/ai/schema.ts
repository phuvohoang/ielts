import { z } from "zod";
export const exerciseTypes = [
  "fill_blank",
  "word_formation",
  "error_correction",
  "sentence_transformation",
  "paraphrasing",
  "sentence_building",
  "guided_writing",
  "sentence_reordering",
  "grammar_in_context",
  "meaning_comparison",
  "mixed",
] as const;
export const exerciseSchema = z.object({
  id: z.string().min(1),
  version: z.literal(1),
  lessonId: z.string(),
  type: z.enum(exerciseTypes),
  difficulty: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  part: z.enum(["A", "B", "C"]),
  instruction: z.string().min(1),
  question: z.string().min(1),
  rootWord: z.string().optional(),
  requiredOpening: z.string().min(1).optional(),
  referenceAnswers: z.array(z.string().min(1)).min(1),
  acceptedVariants: z.array(z.string()),
  grammarRules: z.array(z.string().min(1)).min(1),
  targetSkills: z.array(z.string()).min(1),
  explanation: z.string().min(1),
  rubric: z.string().min(1),
  objective: z.boolean().default(false),
});
export type Exercise = z.infer<typeof exerciseSchema>;
export const statusSchema = z.enum([
  "correct",
  "partially_correct",
  "incorrect",
  "needs_review",
]);
export const resultSchema = z
  .object({
    exerciseId: z.string(),
    status: statusSchema,
    score: z.number().min(0).max(1).nullable(),
    maxScore: z.literal(1),
    userAnswer: z.string().max(3000),
    correctedAnswer: z.string().max(3000),
    alternativeAnswers: z.array(z.string().max(3000)).max(8),
    feedbackVi: z.string().min(1).max(2000),
    grammarRule: z.string().min(1).max(1000),
    explanationVi: z.string().min(1).max(3000),
    errorSpans: z
      .array(
        z.object({
          text: z.string().min(1).max(1000),
          type: z.enum([
            "unnecessary_word",
            "missing_word",
            "grammar",
            "meaning",
            "instruction",
          ]),
          suggestion: z.string().max(1000),
        }),
      )
      .max(20),
    confidence: z.number().min(0).max(1),
    needsReview: z.boolean(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const expected = {
      correct: 1,
      partially_correct: 0.5,
      incorrect: 0,
      needs_review: null,
    }[r.status];
    if (r.score !== expected || r.needsReview !== (r.status === "needs_review"))
      ctx.addIssue({ code: "custom", message: "Inconsistent score/status" });
    if (r.confidence < 0.75 && r.status !== "needs_review")
      ctx.addIssue({
        code: "custom",
        message: "Low confidence requires review",
      });
  });
export type GradeResult = z.infer<typeof resultSchema>;
export const submissionSchema = z
  .object({
    exerciseId: z.string().max(100),
    version: z.literal(1),
    userAnswer: z.string().trim().min(1).max(3000),
  })
  .strict();
export const batchSchema = z
  .object({ submissions: z.array(submissionSchema).min(1).max(8) })
  .strict();
export const normalizeAnswer = (s: string) =>
  s
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[.!?]$/, "");
export function knownResult(
  q: Exercise,
  answer: string,
): GradeResult | undefined {
  if (
    ![...q.referenceAnswers, ...q.acceptedVariants].some(
      (a) => normalizeAnswer(a) === normalizeAnswer(answer),
    )
  )
    return;
  return {
    exerciseId: q.id,
    status: "correct",
    score: 1,
    maxScore: 1,
    userAnswer: answer,
    correctedAnswer: q.referenceAnswers[0],
    alternativeAnswers: q.acceptedVariants,
    feedbackVi: "Đúng. Câu trả lời đáp ứng yêu cầu của bài.",
    grammarRule: q.grammarRules.join(" · "),
    explanationVi: q.explanation,
    errorSpans: [],
    confidence: 1,
    needsReview: false,
  };
}
export function summary(results: GradeResult[]) {
  const scored = results.filter((r) => r.score !== null);
  return {
    score: scored.reduce((n, r) => n + (r.score ?? 0), 0),
    maxScore: scored.length,
    correct: results.filter((r) => r.status === "correct").length,
    partial: results.filter((r) => r.status === "partially_correct").length,
    incorrect: results.filter((r) => r.status === "incorrect").length,
    pending: results.filter((r) => r.status === "needs_review").length,
  };
}
export const attemptSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  exerciseId: z.string(),
  version: z.literal(1),
  userAnswer: z.string(),
  date: z.number(),
  result: resultSchema,
});
export type AIExerciseAttempt = z.infer<typeof attemptSchema>;
export interface ExerciseState {
  exercise: Exercise;
  userAnswer: string;
  gradingResult?: GradeResult;
}
