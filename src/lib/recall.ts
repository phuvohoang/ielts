import { normalize, type familySchema } from "./content";
import type { z } from "zod";

export const wordClasses = ["noun", "adjective", "adverb", "verb"] as const;
export type WordClass = (typeof wordClasses)[number];
export type RecallAnswers = Record<WordClass, string>;
export type RecallFamily = z.infer<typeof familySchema>;
export type RecallField = {
  result: "correct" | "incorrect" | "review";
  expected: string[];
  missing: string[];
  unknown: string[];
};
export type RecallFeedback = Record<WordClass, RecallField>;
export const blankAnswers = (): RecallAnswers => ({
  noun: "",
  adjective: "",
  adverb: "",
  verb: "",
});
const canonical = (word: string) =>
  normalize(word).replace(/organis/g, "organiz");
const noForm = (answer: string) =>
  /^(?:[-–—]|none|n\/a|no common form|không có)$/i.test(answer.trim());

/** Accept recorded forms and spelling variants; defer unlisted words for human review. */
export function gradeRecall(
  family: RecallFamily,
  answers: RecallAnswers,
  allForms = true,
): RecallFeedback {
  return Object.fromEntries(
    wordClasses.map((part) => {
      const expected = family.forms[part] ?? [];
      const given = [
        ...new Set(
          answers[part]
            .split(/[,;\n/]+/)
            .map(canonical)
            .filter(Boolean),
        ),
      ];
      const missing = expected.filter(
        (word) => !given.includes(canonical(word)),
      );
      const unknown = given.filter(
        (word) =>
          !expected.some((expectedWord) => canonical(expectedWord) === word),
      );
      const misplaced = unknown.some((word) =>
        Object.entries(family.forms).some(
          ([other, forms]) =>
            other !== part && forms.some((form) => canonical(form) === word),
        ),
      );
      let result: RecallField["result"];
      if (!answers[part].trim()) result = "incorrect";
      else if (!expected.length && noForm(answers[part])) result = "correct";
      else if (noForm(answers[part]) || misplaced) result = "incorrect";
      else if (unknown.length) result = "review";
      else if (allForms ? missing.length > 0 : !given.length)
        result = "incorrect";
      else result = "correct";
      return [part, { result, expected, missing, unknown }];
    }),
  ) as RecallFeedback;
}
export function recallResult(
  feedback: RecallFeedback,
): "correct" | "incorrect" | "review" {
  const parts = Object.values(feedback);
  return parts.some((p) => p.result === "incorrect")
    ? "incorrect"
    : parts.some((p) => p.result === "review")
      ? "review"
      : "correct";
}
