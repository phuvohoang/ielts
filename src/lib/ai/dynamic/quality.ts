import { normalizeAnswer } from "../schema";
import type { PrivateQuestion } from "./schema";
export const fingerprint = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\b\d+(?:[.,]\d+)*\b/g, "#")
    .replace(/[^\p{L}#_]+/gu, " ")
    .trim();
const words = (text: string) =>
  new Set(
    fingerprint(text)
      .split(" ")
      .filter((w) => w.length > 2),
  );
export function similar(a: string, b: string) {
  const x = words(a),
    y = words(b),
    intersection = [...x].filter((w) => y.has(w)).length;
  return (
    fingerprint(a) === fingerprint(b) ||
    (Math.min(x.size, y.size) >= 4 &&
      intersection / Math.max(x.size, y.size) >= 0.8)
  );
}
export function qualityIssues(
  q: PrivateQuestion,
  previous: string[] = [],
): string[] {
  const issues: string[] = [];
  const answers = [...q.referenceAnswers, ...q.acceptedVariants];
  if (previous.some((s) => similar(q.questionText, s)))
    issues.push("Duplicate or near-duplicate question");
  if (
    q.rootWord?.toLowerCase() === "statistics" &&
    /___\s+significant\b/i.test(q.questionText) &&
    (q.answerForm !== "adverb" ||
      answers.some((a) => normalizeAnswer(a) !== "statistically"))
  )
    issues.push(
      "Statistics before significant requires the adverb statistically",
    );
  const cloze = ["fill_blank", "word_formation", "multiple_choice"].includes(
    q.exerciseType,
  );
  if (
    cloze &&
    (q.questionText.match(/___/g)?.length !== 1 ||
      q.questionText.replace("___", "").includes("_"))
  )
    issues.push("Cloze must have exactly one ___ blank");
  if (cloze && q.answerForm === "sentence")
    issues.push("Cloze needs a word form");
  if (
    ["sentence_transformation", "paraphrasing", "error_correction"].includes(
      q.exerciseType,
    ) &&
    q.answerForm !== "sentence"
  )
    issues.push("Sentence exercise needs sentence answer");
  if (
    (q.exerciseType === "word_formation" || q.topicId === "word-formation") &&
    !q.rootWord?.match(/^[A-Za-z -]{2,60}$/)
  )
    issues.push("Missing valid root word");
  if (cloze && answers.some((a) => !a.match(/^[A-Za-z]+(?:[-'][A-Za-z]+)*$/)))
    issues.push("Expected single-word answers");
  if (q.constraint === "adverb_before_adjective" && q.answerForm !== "adverb")
    issues.push("Adverb required before adjective");
  if (q.constraint === "adjective_before_noun" && q.answerForm !== "adjective")
    issues.push("Adjective required before noun");
  if (
    q.answerForm === "adverb" &&
    cloze &&
    answers.some(
      (a) =>
        !a.toLowerCase().endsWith("ly") &&
        ![
          "well",
          "fast",
          "hard",
          "late",
          "early",
          "straight",
          "daily",
          "enough",
        ].includes(a.toLowerCase()),
    )
  )
    issues.push("Adverb form inconsistent with the validated slot");
  if (
    q.constraint === "adverb_before_adjective" &&
    /___\s+significant\b/i.test(q.questionText) &&
    answers.some((a) => /^statistical$/i.test(a))
  )
    issues.push("statistical cannot modify significant");
  if (new Set(answers.map(normalizeAnswer)).size !== answers.length)
    issues.push("Repeated accepted answer");
  if (
    q.requiredOpening &&
    q.referenceAnswers.some(
      (a) =>
        !normalizeAnswer(a).startsWith(normalizeAnswer(q.requiredOpening!)),
    )
  )
    issues.push("Reference violates opening");
  if (q.exerciseType === "multiple_choice") {
    const correct = q.options.find((o) => o.id === q.correctOptionId);
    if (
      q.options.length !== 4 ||
      new Set(q.options.map((o) => o.id)).size !== 4 ||
      new Set(q.options.map((o) => normalizeAnswer(o.text))).size !== 4
    )
      issues.push("MCQ requires four distinct choices");
    if (
      !correct ||
      !answers.some((a) => normalizeAnswer(a) === normalizeAnswer(correct.text))
    )
      issues.push("Correct option must match a validated answer");
    if (
      q.options.filter((o) =>
        answers.some((a) => normalizeAnswer(a) === normalizeAnswer(o.text)),
      ).length !== 1
    )
      issues.push("Exactly one acceptable MCQ option");
    if (
      q.distractorExplanations.length !== 3 ||
      new Set(q.distractorExplanations.map((e) => e.optionId)).size !== 3 ||
      q.distractorExplanations.some(
        (e) =>
          e.optionId === q.correctOptionId ||
          !q.options.some((o) => o.id === e.optionId),
      )
    )
      issues.push("Explain every distractor");
  } else if (
    q.options.length ||
    q.correctOptionId ||
    q.distractorExplanations.length
  )
    issues.push("Non-MCQ has MCQ fields");
  return issues;
}
export function shuffleOptions(
  q: PrivateQuestion,
  random: () => number = () =>
    crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296,
): PrivateQuestion {
  if (q.exerciseType !== "multiple_choice") return q;
  const options = [...q.options];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { ...q, options };
}
