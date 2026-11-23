import {
  assessmentSchema,
  patternSchema,
  reviewExerciseSchema,
  outcomeSchema,
  writingDraftSchema,
  type Assessment,
  type Pattern,
  type ReviewExercise,
  type ReviewOutcome,
} from "./writing/schema";
import { practiceRecordSchema, type PracticeRecord } from "./practice/schema";
import { localSessionSchema, type PracticeSession } from "./ai/dynamic/schema";
import {
  attemptSchema as aiAttemptSchema,
  type AIExerciseAttempt,
} from "./ai/schema";
import {
  learningProgressSchema,
  checkSchema,
  type LearningProgress,
  type MasteryCheck,
} from "./learning-model";
import { schedule } from "./schedule";
import Dexie, { type Table } from "dexie";
import { z } from "zod";
export const attemptSchema = z.object({
  id: z.number().optional(),
  questionId: z.string(),
  family: z.string(),
  type: z.string(),
  answer: z.string(),
  result: z.enum(["correct", "incorrect", "review"]),
  date: z.number(),
  reviewedAt: z.number().optional(),
  lessonId: z.string().optional(),
  learningStage: z
    .enum(["guided", "independent", "apply", "review", "mastery"])
    .optional(),
  checkId: z.string().optional(),
});
export type Attempt = z.infer<typeof attemptSchema>;
export const progressSchema = z.object({
  id: z.string(),
  correct: z.number(),
  incorrect: z.number(),
  reviews: z.number(),
  streak: z.number(),
  last: z.number(),
  next: z.number(),
  mastered: z.boolean(),
});
export type Progress = z.infer<typeof progressSchema>;
export const writingSchema = z.object({
  id: z.number().optional(),
  text: z.string(),
  date: z.number(),
  applied: z.boolean(),
  original: z.string(),
});
export type Writing = z.infer<typeof writingSchema>;
class LearningDB extends Dexie {
  attempts!: Table<Attempt, number>;
  progress!: Table<Progress, string>;
  writing!: Table<Writing, number>;
  lessons!: Table<LearningProgress, string>;
  checks!: Table<MasteryCheck, string>;
  aiAttempts!: Table<AIExerciseAttempt, string>;
  practiceSessions!: Table<PracticeSession, string>;
  practiceRuns!: Table<PracticeRecord, string>;
  practiceAudio!: Table<{ id: string; blob: Blob }, string>;
  writingAssessments!: Table<Assessment, string>;
  writingPatterns!: Table<Pattern, string>;
  writingExercises!: Table<ReviewExercise, string>;
  writingOutcomes!: Table<ReviewOutcome, string>;
  writingDrafts!: Table<z.infer<typeof writingDraftSchema>, string>;
  constructor() {
    super("ielts-grammar-mastery");
    this.version(1).stores({
      attempts: "++id,questionId,family,date,result",
      progress: "id,next",
      writing: "++id,date",
    });
    this.version(2).stores({
      lessons: "id,reviewDueAt",
      checks: "id,lessonId,startedAt",
    });
    this.version(3).stores({ aiAttempts: "id,sessionId,exerciseId,date" });
    this.version(4).stores({ practiceSessions: "sessionId,updatedAt,status" });
    this.version(6).stores({
      writingAssessments: "id,createdAt",
      writingPatterns: "id,key,status,dueAt,category",
      writingExercises: "id,patternId,level,createdAt",
      writingOutcomes: "id,patternId,exerciseId,date",
      writingDrafts: "id,updatedAt",
    });
    this.version(5).stores({
      practiceRuns: "id,updatedAt,date",
      practiceAudio: "id",
    });
  }
}
export const db = new LearningDB();
export async function record(a: Attempt) {
  await db.transaction("rw", db.attempts, db.progress, async () => {
    await db.attempts.add(a);
    if (a.family && a.result !== "review")
      await db.progress.put(
        schedule(
          await db.progress.get(a.family),
          a.family,
          a.result === "correct",
          a.date,
        ),
      );
  });
}
export const backupSchema = z.union([
  z.object({
    version: z.literal(1),
    attempts: z.array(attemptSchema),
    progress: z.array(progressSchema),
    writing: z.array(writingSchema),
  }),
  z
    .object({
      version: z.union([
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
        z.literal(6),
      ]),
      writingAssessments: z.array(assessmentSchema).optional(),
      writingPatterns: z.array(patternSchema).optional(),
      writingExercises: z.array(reviewExerciseSchema).optional(),
      writingOutcomes: z.array(outcomeSchema).optional(),
      writingDrafts: z.array(writingDraftSchema).optional(),
      practiceSessions: z.array(localSessionSchema).optional(),
      practiceRuns: z.array(practiceRecordSchema).optional(),
      aiAttempts: z.array(aiAttemptSchema).optional(),
      attempts: z.array(attemptSchema),
      progress: z.array(progressSchema),
      writing: z.array(writingSchema),
      lessons: z.array(learningProgressSchema),
      checks: z.array(checkSchema),
    })
    .refine(
      (b) =>
        b.version !== 6 ||
        [
          b.writingAssessments,
          b.writingPatterns,
          b.writingExercises,
          b.writingOutcomes,
          b.writingDrafts,
        ].every((v) => v !== undefined),
      "Version 6 requires writing review tables",
    )
    .refine(
      (b) => b.version === 2 || b.aiAttempts !== undefined,
      "Version 3 and later require AI attempts",
    )
    .refine(
      (b) =>
        (b.version !== 4 && b.version !== 5 && b.version !== 6) ||
        b.practiceSessions !== undefined,
      "Version 4 requires generated sessions",
    )
    .refine(
      (b) =>
        (b.version !== 5 && b.version !== 6) || b.practiceRuns !== undefined,
      "Version 5 requires AI skill practice",
    )
    .refine(
      (b) =>
        b.lessons.every(
          (l) =>
            !l.masteredAt ||
            b.checks.some(
              (c) =>
                c.lessonId === l.id &&
                c.passed === true &&
                c.finishedAt !== undefined &&
                (c.score ?? 0) >= 80,
            ),
        ),
      "Mastered lessons require a passed mastery check",
    ),
]);
export async function exportBackup() {
  return db.transaction(
    "r",
    [
      db.attempts,
      db.progress,
      db.writing,
      db.lessons,
      db.checks,
      db.aiAttempts,
      db.practiceSessions,
      db.practiceRuns,
      db.writingAssessments,
      db.writingPatterns,
      db.writingExercises,
      db.writingOutcomes,
      db.writingDrafts,
    ],
    async () => ({
      version: 6 as const,
      writingAssessments: await db.writingAssessments.toArray(),
      writingPatterns: await db.writingPatterns.toArray(),
      writingExercises: await db.writingExercises.toArray(),
      writingOutcomes: await db.writingOutcomes.toArray(),
      writingDrafts: await db.writingDrafts.toArray(),
      practiceRuns: await db.practiceRuns.toArray(),
      practiceSessions: await db.practiceSessions.toArray(),
      aiAttempts: await db.aiAttempts.toArray(),
      attempts: await db.attempts.toArray(),
      progress: await db.progress.toArray(),
      writing: await db.writing.toArray(),
      lessons: await db.lessons.toArray(),
      checks: await db.checks.toArray(),
    }),
  );
}
export async function importBackup(input: unknown) {
  const b = backupSchema.parse(input);
  await db.transaction(
    "rw",
    [
      db.attempts,
      db.progress,
      db.writing,
      db.lessons,
      db.checks,
      db.aiAttempts,
      db.practiceSessions,
      db.practiceRuns,
      db.writingAssessments,
      db.writingPatterns,
      db.writingExercises,
      db.writingOutcomes,
      db.writingDrafts,
    ],
    async () => {
      if (b.version === 6) {
        await Promise.all([
          db.writingAssessments.clear(),
          db.writingPatterns.clear(),
          db.writingExercises.clear(),
          db.writingOutcomes.clear(),
          db.writingDrafts.clear(),
        ]);
        await db.writingAssessments.bulkAdd(b.writingAssessments ?? []);
        await db.writingPatterns.bulkAdd(b.writingPatterns ?? []);
        await db.writingExercises.bulkAdd(b.writingExercises ?? []);
        await db.writingOutcomes.bulkAdd(b.writingOutcomes ?? []);
        await db.writingDrafts.bulkAdd(b.writingDrafts ?? []);
      }
      await Promise.all([
        db.attempts.clear(),
        db.progress.clear(),
        db.writing.clear(),
      ]);
      await db.attempts.bulkAdd(b.attempts);
      await db.progress.bulkAdd(b.progress);
      await db.writing.bulkAdd(b.writing);
      // A v1 backup predates learning progress: preserve the new tables when restoring it.
      if (
        b.version === 2 ||
        b.version === 3 ||
        b.version === 4 ||
        b.version === 5 ||
        b.version === 6
      ) {
        await db.lessons.clear();
        await db.checks.clear();
        await db.lessons.bulkAdd(b.lessons);
        await db.checks.bulkAdd(b.checks);
        if (
          b.version === 3 ||
          b.version === 4 ||
          b.version === 5 ||
          b.version === 6
        ) {
          await db.aiAttempts.clear();
          await db.aiAttempts.bulkAdd(b.aiAttempts ?? []);
        }
        if (b.version === 4 || b.version === 5 || b.version === 6) {
          await db.practiceSessions.clear();
          await db.practiceSessions.bulkAdd(b.practiceSessions ?? []);
          if (b.version === 5 || b.version === 6) {
            await db.practiceRuns.clear();
            await db.practiceRuns.bulkAdd(b.practiceRuns ?? []);
          }
        }
      }
    },
  );
}

export async function resolveAttempt(
  id: number,
  result: "correct" | "incorrect",
) {
  await db.transaction("rw", db.attempts, db.progress, async () => {
    const a = await db.attempts.get(id);
    if (!a) return;
    await db.attempts.update(id, { result, reviewedAt: Date.now() });
    if (!a.family) return;
    const history = (
      await db.attempts.where("family").equals(a.family).toArray()
    )
      .filter((x) => x.result !== "review")
      .sort((x, y) => (x.reviewedAt ?? x.date) - (y.reviewedAt ?? y.date));
    let progress: Progress | undefined;
    for (const x of history)
      progress = schedule(
        progress,
        a.family,
        x.result === "correct",
        x.reviewedAt ?? x.date,
      );
    if (progress) await db.progress.put(progress);
  });
}
