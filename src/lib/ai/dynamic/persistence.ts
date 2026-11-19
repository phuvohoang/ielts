import { db } from "../../db";
import { localSessionSchema, type PracticeSession } from "./schema";
import type { GradeResult } from "../schema";
export async function saveSession(session: PracticeSession) {
  await db.practiceSessions.put(localSessionSchema.parse(session));
}
export async function saveGraded(
  session: PracticeSession,
  results: GradeResult[],
) {
  await db.transaction("rw", db.practiceSessions, db.aiAttempts, async () => {
    await saveSession(session);
    await db.aiAttempts.bulkAdd(
      results.map((result) => ({
        id: crypto.randomUUID(),
        sessionId: session.sessionId,
        exerciseId: result.exerciseId,
        version: 1 as const,
        userAnswer: result.userAnswer,
        date: Date.now(),
        result,
      })),
    );
  });
}
