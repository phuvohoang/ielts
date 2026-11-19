import { expect, it } from "vitest";
import { questionDisplay } from "./question-display";
import { publicQuestion } from "./schema";
import { questionFixture } from "./test-support";
it("underlines the exact unique source phrase without interpreting HTML", () => {
  const result = questionDisplay({
    questionText: "The plan offers benefits to the economy.",
    instruction: "Replace the underlined part.",
    underlinedText: "benefits to the economy",
  });
  expect(result.parts.filter((p) => p.underline)).toEqual([
    { text: "benefits to the economy", underline: true },
  ]);
  expect(result.missingUnderline).toBe(false);
});
it("reports missing or ambiguous annotations rather than guessing from the root", () => {
  for (const underlinedText of [undefined, "not in the sentence", "economic"]) {
    expect(
      questionDisplay({
        questionText: "The economic plan has economic benefits.",
        instruction: "Replace the underlined part.",
        underlinedText,
      }).missingUnderline,
    ).toBe(true);
  }
});
it("supports legacy underline markers, leaves cloze blanks intact, and keeps HTML as text", () => {
  expect(
    questionDisplay({
      questionText: "The <u>source phrase</u> and __another phrase__.",
      instruction: "Rewrite.",
    })
      .parts.filter((p) => p.underline)
      .map((p) => p.text),
  ).toEqual(["source phrase", "another phrase"]);
  const raw = "Use ___ <img src=x onerror=alert(1)>.";
  expect(
    questionDisplay({ questionText: raw, instruction: "Fill the blank." })
      .parts,
  ).toEqual([{ text: raw, underline: false }]);
});
it("never exposes an answer supplied as an annotation outside the source", () => {
  const q = questionFixture(crypto.randomUUID(), {
    topicId: "word-formation",
    exerciseType: "sentence_transformation",
    ordinal: 0,
  });
  q.underlinedText = "PRIVATE ANSWER";
  expect(publicQuestion(q).underlinedText).toBeNull();
});
