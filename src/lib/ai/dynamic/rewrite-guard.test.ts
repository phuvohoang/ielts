import { expect, it } from "vitest";
import { rewriteProblem } from "./rewrite-guard";
import { publicQuestion } from "./schema";
import { questionFixture } from "./test-support";
import { gradeGenerated } from "../../../../worker/sessions";
import { summary } from "../schema";
const source =
  "The director provided clear instructions for all staff members regarding the new training program.";
function question() {
  return {
    ...questionFixture(crypto.randomUUID(), {
      topicId: "word-formation",
      exerciseType: "paraphrasing",
      ordinal: 5,
    }),
    questionText: source,
    rootWord: "clarity",
    targetWord: "clear",
    referenceAnswers: [source],
    acceptedVariants: [],
  };
}
it("rejects the reported clear/clarity question and punctuation-only copies", () => {
  const q = question();
  expect(rewriteProblem(q)).toContain("source is already an accepted answer");
  q.referenceAnswers = [source.toUpperCase().replace(/\.$/, "!")];
  expect(rewriteProblem(q)).toBeTruthy();
});
it("rejects target forms already supplied even when the rest of the reference changes", () => {
  const q = question();
  q.referenceAnswers = [
    "Clear instructions about the new training program were provided to all staff members by the director.",
  ];
  expect(rewriteProblem(q)).toContain(
    "target word form is already in the source",
  );
});
it("checks copied accepted variants too, without blocking genuine transformations", () => {
  const q = question();
  q.questionText = "The director's instructions were easy to understand.";
  expect(rewriteProblem(q)).toBeUndefined();
  q.acceptedVariants = [q.questionText];
  expect(rewriteProblem(q)).toBeTruthy();
});
it("does not confuse word boundaries or changed numbers with exact copies", () => {
  const q = question();
  q.questionText = "The director explained the instructions clearly.";
  expect(rewriteProblem(q)).toBeUndefined();
  q.topicId = "verb-tenses";
  q.questionText = "There were 15 learners.";
  q.referenceAnswers = ["There were 16 learners."];
  expect(rewriteProblem(q)).toBeUndefined();
});
it("keeps the target answer private and supports old questions without target metadata", () => {
  const q = question();
  expect(publicQuestion(q)).not.toHaveProperty("targetWord");
  delete (q as { targetWord?: string }).targetWord;
  expect(rewriteProblem(q)).toBeTruthy();
});
it("marks an existing invalid task unscored without blaming the learner or calling AI", async () => {
  const q = question();
  delete (q as { targetWord?: string }).targetWord;
  const result = await gradeGenerated(
    { AI_PRACTICE_ONLY: "true" } as never,
    q,
    source,
  );
  expect(result.status).toBe("needs_review");
  expect(result.score).toBeNull();
  expect(result.feedbackVi).toContain("Đề bị lỗi");
  expect(summary([result]).maxScore).toBe(0);
});
