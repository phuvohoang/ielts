import { linkGrammar } from "./foundation-links";
import foundationData from "../data/foundation/questions.json";
import { z } from "zod";
import familyData from "../data/families.json";
import questionData from "../data/questions.json";
import { familySchema, questionSchema } from "./schemas";
export { types, familySchema, questionSchema } from "./schemas";
import { adaptImport, quarantinedIds } from "./importer";
import importedData from "../data/lesson01-import.json";
export const families = z.array(familySchema).parse(familyData);
// Archived IDs remain resolvable for existing attempts and Error Bank entries.
export const legacyQuestions = z
  .array(questionSchema)
  .parse(questionData)
  .map(linkGrammar);
export const importedQuestions = adaptImport(importedData, families).map(
  linkGrammar,
);
export const bankQuestions = importedQuestions.filter(
  (q) => !quarantinedIds.has(q.id),
);
export const foundationQuestions = z
  .array(questionSchema)
  .parse(foundationData);
export const questions = [
  ...bankQuestions,
  ...foundationQuestions.filter((q) => q.learning_stage === "independent"),
];
export const allQuestions = [
  ...legacyQuestions,
  ...importedQuestions,
  ...foundationQuestions,
];
export const questionById = new Map(allQuestions.map((q) => [q.id, q]));
export type Question = z.infer<typeof questionSchema>;
export function normalize(s: string) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function grade(
  q: Question,
  answer: string,
): "correct" | "incorrect" | "review" {
  if (q.choices.length) {
    const choiceKey = (s: string) =>
      s
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[’‘]/g, "'")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[.!?]+$/, "");
    return q.answers.some((a) => choiceKey(a) === choiceKey(answer))
      ? "correct"
      : q.requiresReview
        ? "review"
        : "incorrect";
  }
  if (q.strictPunctuation) {
    const punctuationKey = (s: string) =>
      s
        .normalize("NFKC")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\s*([.!?])\s*/g, "$1 ")
        .trim()
        .replace(/[.!?]$/, "");
    if (q.answers.some((a) => punctuationKey(a) === punctuationKey(answer)))
      return "correct";
    if (q.answers.some((a) => normalize(a) === normalize(answer)))
      return "incorrect";
    return "review";
  }
  if (q.tokens && !sameTokens(q.tokens, answer)) return "incorrect";
  if (q.answers.some((a) => canonical(a) === canonical(answer)))
    return "correct";
  // A root-to-form task needs a transformation unless its root is already a reference.
  // Other unlisted derivatives need human review rather than guessing their validity.
  if (
    q.rootHint &&
    q.id !== "PSWF-072" &&
    canonical(answer) === canonical(q.rootHint)
  )
    return "incorrect";
  return q.requiresReview ? "review" : "incorrect";
}
export function shuffle<T>(items: T[], random = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function canonical(value: string) {
  return normalize(value).replace(
    /\b(?:analyze|analyzed|analyzes|analyzing|organize|organized|organizes|organizing|practice|practiced|practices|practicing)\b/g,
    (word) =>
      ({
        analyze: "analyse",
        analyzed: "analysed",
        analyzes: "analyses",
        analyzing: "analysing",
        organize: "organise",
        organized: "organised",
        organizes: "organises",
        organizing: "organising",
        practice: "practise",
        practiced: "practised",
        practices: "practises",
        practicing: "practising",
      })[word]!,
  );
}
export function sameTokens(tokens: string[], answer: string) {
  return (
    tokens
      .flatMap((t) => canonical(t).split(" "))
      .sort()
      .join("|") ===
    canonical(answer).split(" ").filter(Boolean).sort().join("|")
  );
}
