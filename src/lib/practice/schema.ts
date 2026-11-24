import { assessmentSchema } from "../writing/schema";
import { z } from "zod";
export const skillSchema = z.enum(["listening", "reading", "writing"]);
export type Skill = z.infer<typeof skillSchema>;
export const practiceSettingsSchema = z
  .object({
    skill: skillSchema,
    level: z.enum(["A2", "B1", "B2", "C1"]),
    task: z.enum(["task1", "task2"]),
    focus: z.string().trim().max(120),
    recentTitles: z.array(z.string().max(160)).max(12).default([]),
  })
  .strict();
const text = z.string().trim().min(1);
export const privateItemSchema = z
  .object({
    number: z.number().int().min(1).max(5),
    type: z.enum(["short_answer", "multiple_choice", "true_false_not_given"]),
    prompt: text.max(500),
    options: z
      .array(
        z
          .object({ id: z.enum(["a", "b", "c", "d"]), text: text.max(180) })
          .strict(),
      )
      .max(4),
    wordLimit: z.number().int().min(1).max(10),
    answers: z.array(text.max(300)).min(1).max(6),
    evidence: z.string().max(1200),
    explanationVi: text.max(1200),
  })
  .strict();
export const exerciseContentSchema = z
  .object({
    title: text.max(160),
    instructionsVi: text.max(800),
    passage: z.string().max(6500),
    transcript: z.string().max(3500),
    writingPrompt: z.string().max(1800),
    questions: z.array(privateItemSchema).max(5),
  })
  .strict();
export type PrivateContent = z.infer<typeof exerciseContentSchema>;
export const publicItemSchema = privateItemSchema.omit({
  answers: true,
  evidence: true,
  explanationVi: true,
});
export const practiceIdentitySchema = z.object({
  id: z.string().uuid(),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number(),
});
export const publicExerciseSchema = practiceIdentitySchema.extend({
  settings: practiceSettingsSchema,
  title: text.max(160),
  instructionsVi: text.max(800),
  passage: z.string().max(6500),
  writingPrompt: z.string().max(1800),
  questions: z.array(publicItemSchema).max(5),
  minWords: z.number(),
});
export type PublicExercise = z.infer<typeof publicExerciseSchema>;
export const practiceSubmissionSchema = practiceIdentitySchema
  .pick({ id: true, token: true })
  .extend({
    answers: z.record(z.string(), z.string().max(8000)),
  })
  .strict();
export const itemGradeSchema = z
  .object({
    number: z.number().int().min(1).max(5),
    status: z.enum(["correct", "incorrect", "needs_review"]),
    feedbackVi: text.max(1200),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export const writingGradeSchema = z
  .object({
    taskResponse: z.number().min(0).max(9),
    coherence: z.number().min(0).max(9),
    vocabulary: z.number().min(0).max(9),
    grammar: z.number().min(0).max(9),
    feedbackVi: text.max(2400),
    strengthsVi: z.array(text.max(500)).max(4),
    improvementsVi: z.array(text.max(600)).max(5),
    corrections: z
      .array(
        z
          .object({
            original: text.max(400),
            corrected: text.max(500),
            reasonVi: text.max(600),
          })
          .strict(),
      )
      .max(8),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export const practiceResultSchema = z.object({
  items: z.array(itemGradeSchema).max(5),
  score: z.number().nullable(),
  maxScore: z.number(),
  writing: writingGradeSchema.nullable(),
  writingAssessment: assessmentSchema.optional(),
  bandEstimate: z.number().nullable(),
  transcript: z.string().max(3500),
  reveals: z.array(privateItemSchema).max(5),
  submittedAnswers: z.record(z.string(), z.string()),
});
export type PracticeResult = z.infer<typeof practiceResultSchema>;
export const practiceRecordSchema = z.object({
  id: z.string().uuid(),
  date: z.number(),
  updatedAt: z.number(),
  exercise: publicExerciseSchema,
  answers: z.record(z.string(), z.string().max(8000)),
  result: practiceResultSchema.optional(),
  submitted: z.boolean().default(false),
});
export type PracticeRecord = z.infer<typeof practiceRecordSchema>;
