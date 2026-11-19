import type { PrivateQuestion } from "./schema";
// Compare actual words/numbers, ignoring presentation, case and punctuation.
// Unlike history fingerprints, do not collapse different numbers or synonyms.
const canonical = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/<\/?u>/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const contains = (sentence: string, word: string) =>
  ` ${canonical(sentence)} `.includes(` ${canonical(word)} `);
export function rewriteProblem(q: PrivateQuestion): string | undefined {
  if (
    !["sentence_transformation", "paraphrasing", "error_correction"].includes(
      q.exerciseType,
    )
  )
    return;
  const answers = [...q.referenceAnswers, ...q.acceptedVariants];
  if (answers.some((answer) => canonical(answer) === canonical(q.questionText)))
    return "The source is already an accepted answer. Write a different source requiring a genuine change; never accept an unchanged copy.";
  if (
    q.topicId !== "word-formation" ||
    q.exerciseType === "error_correction" ||
    !q.targetWord
  )
    return;
  if (contains(q.questionText, q.targetWord))
    return "The requested target word form is already in the source. Rewrite the SOURCE using a different word-family form, not merely a different word order.";
  if (canonical(q.targetWord) === canonical(q.rootWord ?? ""))
    return "The target word must be a changed form of the root, not the root itself.";
  if (!q.referenceAnswers.some((answer) => contains(answer, q.targetWord!)))
    return "targetWord must identify the actual changed word-family form in a complete reference answer.";
}
