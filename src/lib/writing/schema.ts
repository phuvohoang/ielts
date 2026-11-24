import { z } from "zod";
const text = z.string().min(1).max(2400);
export const categorySchema = z.enum([
  "grammar",
  "collocation",
  "word_choice",
  "preposition",
  "article",
  "sentence_structure",
  "register",
]);
export const issueSchema = z
  .object({
    original: z.string().min(1).max(1000),
    occurrence: z.number().int().min(1).max(100),
    correction: text,
    alternatives: z.array(text).max(12),
    explanationVi: text,
    targetPattern: text,
    ruleId: z.string().regex(/^[a-z0-9_]{3,100}$/),
    category: categorySchema,
    severity: z.enum(["minor", "major"]),
    kind: z.enum(["error", "style"]),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export const criterionSchema = z
  .object({ band: z.number().min(0).max(9).multipleOf(0.5), feedbackVi: text })
  .strict();
export const assessmentOutputSchema = z
  .object({
    criteria: z
      .object({
        task: criterionSchema,
        coherence: criterionSchema,
        lexical: criterionSchema,
        grammar: criterionSchema,
      })
      .strict(),
    summaryVi: text,
    strengthsVi: z.array(text).max(8),
    revisedEssay: z.string().min(1).max(16000),
    omissions: z
      .array(
        z
          .object({
            requirement: text,
            explanationVi: text,
            suggestionVi: text,
          })
          .strict(),
      )
      .max(20),
    issues: z.array(issueSchema).max(80),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export const essayInputSchema = z
  .object({
    essayId: z.string().uuid(),
    task: z.enum(["task1", "task2"]),
    prompt: z
      .string()
      .min(1)
      .max(4000)
      .refine((s) => !!s.trim()),
    essay: z
      .string()
      .min(1)
      .max(12000)
      .refine((s) => !!s.trim()),
  })
  .strict();
export const evidenceSchema = issueSchema.extend({
  start: z.number().int().min(0),
  end: z.number().int().positive(),
  id: z.string(),
  status: z.enum(["pending", "accepted", "dismissed", "merged"]),
  patternId: z.string().optional(),
});
export const assessmentSchema = z.object({
  id: z.string().uuid(),
  task: z.enum(["task1", "task2"]),
  prompt: z.string(),
  originalEssay: z.string(),
  createdAt: z.number(),
  criteria: assessmentOutputSchema.shape.criteria,
  summaryVi: text,
  strengthsVi: z.array(text),
  revisedEssay: z.string(),
  omissions: assessmentOutputSchema.shape.omissions,
  issues: z.array(evidenceSchema),
  quarantined: z.number().int().min(0),
  confidence: z.number().min(0).max(1),
  bandEstimate: z.number().nullable(),
});
export const patternSchema = z.object({
  id: z.string(),
  key: z.string(),
  category: categorySchema,
  ruleId: z.string(),
  targetPattern: text,
  correction: text,
  alternatives: z.array(text),
  explanationVi: text,
  severity: z.enum(["minor", "major"]),
  status: z.enum(["learning", "reviewing", "mastered", "merged"]),
  mergedInto: z.string().optional(),
  evidenceIds: z.array(z.string()),
  essayIds: z.array(z.string()),
  originalExamples: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
  dueAt: z.number(),
  intervalDays: z.number().min(0),
  streak: z.number().int().min(0),
  lapses: z.number().int().min(0),
  successfulContexts: z.array(z.string()),
  successfulDays: z.array(z.string()),
  freeWritingPassed: z.boolean(),
});
export const exerciseContentSchema = z
  .object({
    promptVi: text,
    promptEn: z.string().max(2000),
    context: text,
    referenceAnswers: z.array(text).min(1).max(10),
    rubric: text,
  })
  .strict();
export const exerciseRequestSchema = z
  .object({
    patternId: z.string().min(1).max(180),
    level: z.number().int().min(1).max(4),
    pattern: patternSchema,
    recentContexts: z.array(z.string().max(2400)).max(12).default([]),
  })
  .strict();
export const reviewExerciseSchema = z.object({
  id: z.string().uuid(),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number(),
  patternId: z.string(),
  level: z.number().int().min(1).max(4),
  promptVi: text,
  promptEn: z.string(),
  context: text,
  createdAt: z.number(),
  draftAnswer: z.string().max(8000).optional(),
});
export const reviewGradeOutputSchema = z
  .object({
    status: z.enum(["correct", "incorrect", "needs_review"]),
    feedbackVi: text,
    correction: text,
    alternatives: z.array(text).max(12),
    confidence: z.number().min(0).max(1),
    contextualEvidence: z.boolean(),
  })
  .strict();
export const reviewGradeSchema = reviewGradeOutputSchema.extend({
  exerciseId: z.string(),
  answer: z.string(),
  referenceAnswers: z.array(z.string()),
});
export const reviewSubmissionSchema = z
  .object({
    id: z.string().uuid(),
    token: z.string().regex(/^[a-f0-9]{64}$/),
    answer: z
      .string()
      .min(1)
      .max(8000)
      .refine((s) => !!s.trim()),
  })
  .strict();
export const outcomeSchema = z.object({
  id: z.string(),
  patternId: z.string(),
  exerciseId: z.string(),
  level: z.number(),
  date: z.number(),
  result: reviewGradeSchema,
});
export type Assessment = z.infer<typeof assessmentSchema>;
export type Issue = z.infer<typeof evidenceSchema>;
export type Pattern = z.infer<typeof patternSchema>;
export type ReviewExercise = z.infer<typeof reviewExerciseSchema>;
export type ReviewGrade = z.infer<typeof reviewGradeSchema>;
export type ReviewOutcome = z.infer<typeof outcomeSchema>;
export const writingDraftSchema = z.object({
  id: z.string(),
  task: z.enum(["task1", "task2"]),
  prompt: z.string().max(4000),
  essay: z.string().max(12000),
  updatedAt: z.number(),
});
