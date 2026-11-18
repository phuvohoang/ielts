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
  constructor() {
    super("ielts-grammar-mastery");
    this.version(1).stores({
      attempts: "++id,questionId,family,date,result",
      progress: "id,next",
      writing: "++id,date",
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
export const backupSchema = z.object({
  version: z.literal(1),
  attempts: z.array(attemptSchema),
  progress: z.array(progressSchema),
  writing: z.array(writingSchema),
});
export async function exportBackup() {
  return {
    version: 1 as const,
    attempts: await db.attempts.toArray(),
    progress: await db.progress.toArray(),
    writing: await db.writing.toArray(),
  };
}
export async function importBackup(input: unknown) {
  const b = backupSchema.parse(input);
  await db.transaction("rw", db.attempts, db.progress, db.writing, async () => {
    await Promise.all([
      db.attempts.clear(),
      db.progress.clear(),
      db.writing.clear(),
    ]);
    await db.attempts.bulkAdd(b.attempts);
    await db.progress.bulkAdd(b.progress);
    await db.writing.bulkAdd(b.writing);
  });
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
