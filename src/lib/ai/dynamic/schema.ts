import { z } from "zod";
import { resultSchema, normalizeAnswer } from "../schema";
import { formats, levels, topics, type Topic } from "./topics";
const text = z.string().trim().min(1).max(1200);
export const settingsSchema = z
  .object({
    topics: z
      .array(z.string().max(80))
      .min(1)
      .max(10)
      .refine((v) => new Set(v).size === v.length, "Select each topic once"),
    questionCount: z.union([z.literal(10), z.literal(20), z.literal(50)]),
    difficulty: z.enum(levels),
    exerciseType: z.enum(["mixed", ...formats]),
    feedbackMode: z.enum(["instant", "exam"]),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export class UnsupportedSettingsError extends Error {}
export function validateSettings(
  input: unknown,
  registry: Topic[] = topics,
): Settings {
  const value = settingsSchema.strip().parse(input);
  for (const id of value.topics) {
    const topic = registry.find((t) => t.topicId === id);
    if (
      !topic?.enabled ||
      !topic.generationGuidelines.trim() ||
      !topic.gradingRubric.trim() ||
      !topic.supportedLevels.includes(value.difficulty) ||
      !(value.exerciseType === "mixed"
        ? topic.supportedExerciseTypes.length
        : topic.supportedExerciseTypes.includes(value.exerciseType))
    )
      throw new UnsupportedSettingsError(
        "Unsupported topic, level or exercise type",
      );
  }
  return value;
}
export const optionSchema = z
  .object({ id: z.enum(["a", "b", "c", "d"]), text: text })
  .strict();
export const contentSchema = z
  .object({
    questionText: text,
    instruction: text,
    rootWord: z.string().trim().max(80).nullable(),
    referenceAnswers: z.array(text).min(1).max(6),
    acceptedVariants: z.array(text).max(8),
    grammarRules: z.array(z.string().min(1).max(200)).min(1).max(5),
    targetSkills: z.array(z.string().min(1).max(100)).min(1).max(5),
    explanationVi: z.string().min(20).max(2000),
    answerForm: z.enum([
      "noun",
      "verb",
      "adjective",
      "adverb",
      "sentence",
      "other",
    ]),
    constraint: z.enum([
      "adverb_before_adjective",
      "adjective_before_noun",
      "noun_slot",
      "verb_slot",
      "other",
      "sentence",
    ]),
    requiredOpening: z.string().max(150).nullable(),
    options: z.array(optionSchema).max(4),
    correctOptionId: z.enum(["a", "b", "c", "d"]).nullable(),
    distractorExplanations: z
      .array(
        z
          .object({
            optionId: z.enum(["a", "b", "c", "d"]),
            explanationVi: z.string().min(10).max(500),
          })
          .strict(),
      )
      .max(3),
  })
  .strict();
export type QuestionContent = z.infer<typeof contentSchema>;
export const privateQuestionSchema = contentSchema
  .extend({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    topicId: z.string().min(1),
    exerciseType: z.enum(formats),
    difficulty: z.enum(levels),
    generationVersion: z.literal(1),
    ordinal: z.number().int().min(0).max(49),
  })
  .strict();
export type PrivateQuestion = z.infer<typeof privateQuestionSchema>;
export const publicQuestionSchema = privateQuestionSchema
  .omit({
    referenceAnswers: true,
    acceptedVariants: true,
    explanationVi: true,
    answerForm: true,
    constraint: true,
    correctOptionId: true,
    distractorExplanations: true,
    requiredOpening: true,
  })
  .extend({
    // A task constraint is public, not an answer key. Optional for older saved work.
    requiredOpening: z.string().max(150).nullable().optional(),
  });
export type PublicQuestion = z.infer<typeof publicQuestionSchema>;
export function visibleOpening(q: PrivateQuestion): string | null {
  if (
    !q.requiredOpening ||
    [...q.referenceAnswers, ...q.acceptedVariants].some(
      (a) => normalizeAnswer(a) === normalizeAnswer(q.requiredOpening!),
    )
  )
    return null;
  return q.requiredOpening;
}
export function publicQuestion(q: PrivateQuestion): PublicQuestion {
  // Older cached questions predate the source guards. Never expose an entire key.
  return publicQuestionSchema
    .strip()
    .parse({ ...q, requiredOpening: visibleOpening(q) });
}
export const historySchema = z
  .object({
    recentQuestions: z.array(z.string().max(1200)).max(60).default([]),
    failedSkills: z.array(z.string().max(100)).max(15).default([]),
  })
  .strict();
export const createSchema = settingsSchema.extend(historySchema.shape).strict();
export const continuationSchema = z
  .object({
    sessionId: z.string().uuid(),
    accessToken: z.string().regex(/^[a-f0-9]{64}$/),
    batchIndex: z.number().int().min(0).max(4),
    allowPartial: z.literal(true).optional(),
  })
  .strict();
export const dynamicGradeSchema = z
  .object({
    sessionId: z.string().uuid(),
    accessToken: z.string().regex(/^[a-f0-9]{64}$/),
    submissions: z
      .array(
        z
          .object({
            exerciseId: z.string().uuid(),
            version: z.literal(1),
            userAnswer: z.string().trim().min(1).max(3000),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();
export const examSubmissionSchema = z
  .object({
    sessionId: z.string().uuid(),
    accessToken: z.string().regex(/^[a-f0-9]{64}$/),
    answers: z.record(z.string(), z.string().trim().min(1).max(3000)),
  })
  .strict();
export const sessionIdentitySchema = z.object({
  sessionId: z.string().uuid(),
  accessToken: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number(),
  settings: settingsSchema,
});
export const generationResponseSchema = sessionIdentitySchema.extend({
  questions: z.array(publicQuestionSchema).max(50),
  nextBatch: z.number().int().min(0).max(5),
  complete: z.boolean(),
});
export const revealSchema = z.object({
  referenceAnswers: z.array(text).min(1).max(6),
  acceptedVariants: z.array(text).max(8),
  explanationVi: z.string().min(1).max(2000),
  distractorExplanations: z
    .array(
      z.object({
        optionId: z.enum(["a", "b", "c", "d"]),
        explanationVi: z.string().max(500),
      }),
    )
    .max(3),
});
export const localSessionSchema = sessionIdentitySchema.extend({
  createdAt: z.number(),
  updatedAt: z.number(),
  questions: z.array(publicQuestionSchema).max(50),
  nextBatch: z.number().int().min(0).max(5),
  generationComplete: z.boolean(),
  reveals: z.record(z.string(), revealSchema),
  answers: z.record(z.string(), z.string().max(3000)),
  results: z.record(z.string(), resultSchema),
  currentIndex: z.number().int().min(0).max(49),
  status: z.enum(["practicing", "submitted", "completed"]),
  examSubmitted: z.boolean(),
});
export type PracticeSession = z.infer<typeof localSessionSchema>;
export type PlanItem = {
  topicId: string;
  exerciseType: (typeof formats)[number];
  ordinal: number;
};
export function makePlan(
  settings: Settings,
  registry: Topic[] = topics,
): PlanItem[] {
  validateSettings(settings, registry);
  const counts = new Map<string, number>();
  return Array.from({ length: settings.questionCount }, (_, ordinal) => {
    const topic = registry.find(
      (t) => t.topicId === settings.topics[ordinal % settings.topics.length],
    )!;
    const count = counts.get(topic.topicId) ?? 0;
    counts.set(topic.topicId, count + 1);
    return {
      topicId: topic.topicId,
      exerciseType:
        settings.exerciseType === "mixed"
          ? topic.supportedExerciseTypes[
              count % topic.supportedExerciseTypes.length
            ]
          : settings.exerciseType,
      ordinal,
    };
  });
}
