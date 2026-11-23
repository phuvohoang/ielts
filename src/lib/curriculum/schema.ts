import { z } from "zod";
const text = z.string().trim().min(1).max(2400);
export const cefrSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
export const sourceSchema = z
  .object({
    bookId: text,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    pdfPages: z.array(z.number().int().positive()).min(1),
    printedPages: text,
    method: z.enum(["visual_review", "text_and_visual_review"]),
    reviewedOn: z.string().date(),
  })
  .strict();
const baseKnowledge = z
  .object({
    id: text,
    unitId: text,
    title: text,
    explanationVi: text,
    cefr: cefrSchema,
    skills: z
      .array(z.enum(["writing", "reading", "listening", "speaking"]))
      .min(1),
    objectivesVi: z.array(text).min(1),
    examples: z.array(text).min(1),
    commonMistakesVi: z.array(text).min(1),
    alternatives: z.array(text),
    sources: z.array(sourceSchema).min(1),
    verification: z.enum(["verified", "draft"]),
    authorship: z.literal("independently_authored"),
  })
  .strict();
export const grammarKnowledgeSchema = baseKnowledge.extend({
  kind: z.literal("grammar"),
  ruleIds: z.array(text).min(1),
});
export const collocationKnowledgeSchema = baseKnowledge.extend({
  kind: z.literal("collocation"),
  combination: text,
  incorrectCombinations: z.array(text),
});
export const vocabularyKnowledgeSchema = baseKnowledge.extend({
  kind: z.literal("vocabulary"),
  headword: text,
  partOfSpeech: text,
  wordFamily: z.array(text),
  collocations: z.array(text),
  ieltsTopic: text,
});
export const knowledgeSchema = z.discriminatedUnion("kind", [
  grammarKnowledgeSchema,
  collocationKnowledgeSchema,
  vocabularyKnowledgeSchema,
]);
export type Knowledge = z.infer<typeof knowledgeSchema>;
export const formatSchema = z.enum([
  "multiple_choice",
  "fill_blank",
  "error_correction",
  "sentence_transformation",
  "paraphrasing",
  "word_formation",
  "collocation",
  "translation",
  "guided_writing",
  "free_writing",
]);
export const candidateSchema = z
  .object({
    id: z.string().uuid(),
    format: formatSchema,
    question: text,
    instructions: text,
    testedPatternIds: z.array(text).min(1).max(3),
    difficulty: cefrSchema,
    options: z.array(text).max(4),
    expectedAnswer: text,
    acceptedAlternatives: z.array(text).max(8),
    explanationVi: text,
    rubric: text,
    requiredOpening: z.string().max(100),
  })
  .strict();
export type Candidate = z.infer<typeof candidateSchema>;
export const checksSchema = z
  .object({
    grammar: z.boolean(),
    semantics: z.boolean(),
    instructions: z.boolean(),
    targetPattern: z.boolean(),
    alternatives: z.boolean(),
    difficulty: z.boolean(),
    unambiguous: z.boolean(),
    natural: z.boolean(),
  })
  .strict();
export const validationSchema = z
  .object({
    gateVersion: z.literal(1),
    method: z.literal("deterministic_and_independent_ai"),
    checks: checksSchema,
  })
  .strict();
export const publicQuestionSchema = candidateSchema
  .omit({
    expectedAnswer: true,
    acceptedAlternatives: true,
    explanationVi: true,
    rubric: true,
  })
  .extend({ validation: validationSchema })
  .strict();
export const generateRequestSchema = z
  .object({ unitId: text, patternIds: z.array(text).min(1).max(3) })
  .strict();
export const sessionSchema = z
  .object({
    id: z.string().uuid(),
    token: z.string().regex(/^[a-f0-9]{64}$/),
    unitId: text,
    patternIds: z.array(text).min(1).max(3),
    expiresAt: z.number(),
    questions: z.array(publicQuestionSchema).length(10),
  })
  .strict();
export type CurriculumSession = z.infer<typeof sessionSchema>;
export const submissionSchema = z
  .object({
    id: z.string().uuid(),
    token: z.string().regex(/^[a-f0-9]{64}$/),
    questionId: z.string().uuid(),
    answer: z.string().trim().min(1).max(8000),
  })
  .strict();
export const gradeOutputSchema = z
  .object({
    status: z.enum(["correct", "incorrect", "needs_review"]),
    confidence: z.number().min(0).max(1),
    feedbackVi: text,
    demonstratesPattern: z.boolean(),
  })
  .strict();
export const gradeSchema = gradeOutputSchema
  .extend({
    questionId: z.string().uuid(),
    answer: z.string().min(1).max(8000),
    expectedAnswer: text,
    acceptedAlternatives: z.array(text),
    explanationVi: text,
  })
  .strict();
export const curriculumRunSchema = sessionSchema.extend({
  answers: z.record(z.string(), z.string().max(8000)),
  results: z.record(z.string(), gradeSchema),
  updatedAt: z.number(),
});
export const curriculumProgressSchema = z
  .object({
    id: text,
    dueAt: z.number(),
    intervalDays: z.number().nonnegative(),
    streak: z.number().int().nonnegative(),
    correct: z.number().int().nonnegative(),
    incorrect: z.number().int().nonnegative(),
    completedQuestionIds: z.array(z.string().uuid()),
    updatedAt: z.number(),
  })
  .strict();
