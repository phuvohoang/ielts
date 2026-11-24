// Clock reads timestamp completed practice attempts, not render keys or animation.
import { z } from "zod";
import { db } from "./db";
import { gradeExercise } from "./ai/client";
import { knownResult, type GradeResult } from "./ai/schema";
import {
  guidedLesson,
  guidedExercises,
  guidedSessionId,
} from "./guided-lesson";
const draftsSchema = z.record(z.string(), z.string().max(3000));
const draftKey = `ielts:guided-drafts:${guidedLesson.id}:v1`;
export function readGuidedDrafts() {
  return draftsSchema.parse(JSON.parse(localStorage.getItem(draftKey) || "{}"));
}
export function writeGuidedDrafts(drafts: Record<string, string>) {
  localStorage.setItem(draftKey, JSON.stringify(draftsSchema.parse(drafts)));
}
export async function readGuidedResults() {
  const rows = await db.aiAttempts
    .where("sessionId")
    .equals(guidedSessionId)
    .toArray();
  return Object.fromEntries(
    rows.sort((a, b) => a.date - b.date).map((a) => [a.exerciseId, a.result]),
  );
}
export async function gradeGuided(
  id: string,
  input: string,
): Promise<GradeResult> {
  const q = guidedExercises.find((q) => q.id === id),
    authored = guidedLesson.questions.find((q) => q.id === id);
  const answer = input.trim();
  if (!q || !authored || !answer || answer.length > 3000)
    throw Error("Câu hỏi hoặc câu trả lời chưa hợp lệ.");
  let result: GradeResult;
  if (authored.kind === "choice") {
    if (!authored.choices.includes(answer))
      throw Error("Hãy chọn một đáp án trong câu hỏi.");
    result = knownResult(q, answer) || {
      exerciseId: q.id,
      status: "incorrect",
      score: 0,
      maxScore: 1,
      userAnswer: answer,
      correctedAnswer: q.referenceAnswers[0],
      alternativeAnswers: [],
      feedbackVi: q.explanation,
      grammarRule: q.targetSkills.join(" · "),
      explanationVi: q.explanation,
      errorSpans: [],
      confidence: 1,
      needsReview: false,
    };
  } else {
    // A finite example list is never evidence that unseen free text is wrong.
    result = await gradeExercise(q, answer);
  }
  await db.aiAttempts.add({
    id: crypto.randomUUID(),
    sessionId: guidedSessionId,
    exerciseId: q.id,
    version: 1,
    userAnswer: answer,
    date: Date.now(),
    result,
  });
  return result;
}
