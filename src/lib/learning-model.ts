import { z } from "zod";
export const stages = [
  "learn",
  "understand",
  "guided",
  "independent",
  "apply",
  "review",
  "mastery",
] as const;
export type Stage = (typeof stages)[number];
export const learningProgressSchema = z
  .object({
    id: z.string(),
    startedAt: z.number(),
    completed: z.array(z.enum(stages)),
    reviewDueAt: z.number().optional(),
    masteredAt: z.number().optional(),
  })
  .refine(
    (p) => p.completed.every((stage, i) => stage === stages[i]),
    "Learning stages must be a unique ordered prefix",
  )
  .refine(
    (p) => p.completed.includes("mastery") === (p.masteredAt !== undefined),
    "Mastery requires a completed check timestamp",
  );
export type LearningProgress = z.infer<typeof learningProgressSchema>;
export const checkSchema = z.object({
  id: z.string(),
  lessonId: z.string(),
  questionIds: z.array(z.string()).length(6),
  startedAt: z.number(),
  finishedAt: z.number().optional(),
  score: z.number().min(0).max(100).optional(),
  passed: z.boolean().optional(),
});
export type MasteryCheck = z.infer<typeof checkSchema>;
export function lessonStatus(progress: LearningProgress | undefined) {
  if (!progress) return "Not Started";
  if (progress.masteredAt && progress.completed.includes("mastery"))
    return "Mastered";
  if (progress.completed.includes("apply")) return "Reviewing";
  if (progress.completed.includes("understand")) return "Practicing";
  return "Learning";
}
export function nextStage(progress: LearningProgress | undefined): Stage {
  return stages.find((s) => !progress?.completed.includes(s)) ?? "mastery";
}
