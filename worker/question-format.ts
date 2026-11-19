import type { PrivateQuestion } from "../src/lib/ai/dynamic/schema";
import { normalizeAnswer } from "../src/lib/ai/schema";
import { isChoiceFormat } from "../src/lib/ai/dynamic/topics";
export function draftIssues(q: PrivateQuestion): string[] {
  if (
    q.topicId === "word-formation" &&
    ["fill_blank", "word_formation"].includes(q.exerciseType) &&
    q.rootWord &&
    [...q.referenceAnswers, ...q.acceptedVariants].some(
      (a) => normalizeAnswer(a) === normalizeAnswer(q.rootWord!),
    )
  )
    return [
      "The supplied root already gives the cloze answer. Choose a task requiring a genuinely changed word-family form.",
    ];
  if (
    /underlin(?:ed|e)|gạch chân/i.test(q.instruction) &&
    (!q.underlinedText ||
      !q.questionText.includes(q.underlinedText) ||
      q.questionText.indexOf(q.underlinedText) !==
        q.questionText.lastIndexOf(q.underlinedText))
  )
    return [
      "Instruction refers to an underline: provide its exact unique source substring in underlinedText, or remove that reference from the instruction.",
    ];

  if (isChoiceFormat(q.exerciseType)) {
    if (
      q.options.length !== 4 ||
      new Set(q.options.map((o) => o.id)).size !== 4 ||
      new Set(q.options.map((o) => o.text.trim().toLowerCase())).size !== 4 ||
      !q.options.some((o) => o.id === q.correctOptionId)
    )
      return [
        "Provide exactly four distinct options a,b,c,d and a valid private correctOptionId.",
      ];
    const correct = q.options.find((o) => o.id === q.correctOptionId)!;
    if (
      !q.referenceAnswers.some(
        (a) => normalizeAnswer(a) === normalizeAnswer(correct.text),
      )
    )
      return [
        "referenceAnswers must contain the correct option TEXT, not its ID or an unrelated key.",
      ];
    if (
      q.options.filter((option) =>
        [...q.referenceAnswers, ...q.acceptedVariants].some(
          (a) => normalizeAnswer(a) === normalizeAnswer(option.text),
        ),
      ).length !== 1
    )
      return [
        "Exactly one option may match the private accepted keys; remove ambiguous extra option keys.",
      ];
    if (
      q.distractorExplanations.length !== 3 ||
      new Set(q.distractorExplanations.map((d) => d.optionId)).size !== 3 ||
      q.distractorExplanations.some(
        (d) =>
          d.optionId === q.correctOptionId ||
          !q.options.some((o) => o.id === d.optionId),
      )
    )
      return ["Explain each of the three distinct distractor IDs privately."];
  } else if (
    q.options.length ||
    q.correctOptionId ||
    q.distractorExplanations.length
  )
    return [
      "Non-choice formats must have empty options/distractors and a null option key.",
    ];
  if (
    ["fill_blank", "word_formation", "grammar_in_context"].includes(
      q.exerciseType,
    ) &&
    q.questionText.match(/___/g)?.length !== 1
  )
    return ["Use exactly one ___ gap."];
  if (
    q.exerciseType === "sentence_reordering" &&
    (q.referenceAnswers[0].split(/\s+/).length < 3 ||
      q.referenceAnswers[0].split(/\s+/).length > 40)
  )
    return ["Reordering needs a complete 3–40-token reference sentence."];
  return [];
}
export function prepareOrdering(q: PrivateQuestion): PrivateQuestion {
  if (q.exerciseType !== "sentence_reordering") return q;
  const original = q.referenceAnswers[0].trim().split(/\s+/),
    tokens = [...original];
  for (let i = tokens.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [tokens[i], tokens[j]] = [tokens[j], tokens[i]];
  }
  if (tokens.join(" ") === original.join(" ")) tokens.push(tokens.shift()!);
  return {
    ...q,
    questionText: tokens.join(" / "),
    reorderTokens: tokens,
    instruction:
      "Arrange all the words into a grammatical sentence. Use each token once.",
  };
}
