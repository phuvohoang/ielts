// Synthetic fixtures for deterministic tests only. Never imported by application or Worker entry points.
import type { PlanItem, PrivateQuestion, QuestionContent } from "./schema";
const families = [
  ["CARE", "carefully", "careful", "care"],
  ["PATIENCE", "patiently", "patient", "patience"],
  ["CONFIDENCE", "confidently", "confident", "confidence"],
  ["POLITENESS", "politely", "polite", "politeness"],
  ["CLARITY", "clearly", "clear", "clarity"],
  ["ACCURACY", "accurately", "accurate", "accuracy"],
  ["EFFICIENCY", "efficiently", "efficient", "efficiency"],
  ["QUIET", "quietly", "quiet", "quietness"],
  ["REGULAR", "regularly", "regular", "regularity"],
  ["SAFETY", "safely", "safe", "safety"],
];
const contexts = [
  "inside the crowded railway terminal",
  "during the annual outdoor festival",
  "at the village health centre",
  "near the remote mountain crossing",
  "throughout the morning radio programme",
  "beside the newly repaired bridge",
  "through the busy coastal harbour",
  "across the school sports complex",
  "during an important laboratory inspection",
  "after the regional farming conference",
];
const roles = [
  "event organisers",
  "delivery drivers",
  "medical volunteers",
  "ticket inspectors",
  "museum visitors",
  "office assistants",
  "local shopkeepers",
  "park rangers",
  "factory workers",
  "tour guides",
];
export function contentFixture(item: PlanItem, salt = 0): QuestionContent {
  const i = item.ordinal,
    [root, adverb, adjective, noun] = families[i % 10];
  const context = contexts[(i + salt) % 10],
    role = roles[(Math.floor(i / 10) + i + salt) % 10];
  const sentence = [
    `The ${role} had to work ${adverb} ${context}.`,
    `The schedule required ${role} to complete each assigned task ${adverb} ${context}.`,
    `Training helped the ${role} perform ${adverb} while facing unexpected challenges ${context}.`,
    `A supervisor reminded several ${role} to behave ${adverb} throughout their shift ${context}.`,
    `Experienced ${role} learned to respond ${adverb} whenever new responsibilities arose ${context}.`,
  ][Math.floor(i / 10) % 5];
  const cloze = [
    "word_formation",
    "fill_blank",
    "multiple_choice",
    "grammar_in_context",
    "meaning_comparison",
  ].includes(item.exerciseType);
  const mcq = ["multiple_choice", "meaning_comparison"].includes(
    item.exerciseType,
  );
  return {
    gradingCriteria: [
      "Use a grammatical form and preserve the intended meaning.",
    ],
    targetWord: adverb,
    underlinedText: null,
    questionText: cloze
      ? sentence.replace(adverb, "___")
      : item.exerciseType === "error_correction"
        ? sentence.replace(adverb, adjective)
        : `The ${role} were ${adjective} ${context}.`,
    instruction: cloze
      ? "Use the correct word form to complete the sentence."
      : item.exerciseType === "error_correction"
        ? "Correct the word-form error."
        : "Rewrite using an adverb to describe how they worked.",
    rootWord: root,
    referenceAnswers: [cloze ? adverb : sentence],
    acceptedVariants: [],
    grammarRules: ["Adverbs modify action verbs"],
    targetSkills: ["Word family recall", "Adverb placement"],
    explanationVi:
      "Dùng Adverb để bổ nghĩa cho hành động work; chọn dạng từ phù hợp với vị trí và ngữ cảnh.",
    answerForm: cloze ? "adverb" : "sentence",
    constraint: cloze ? "other" : "sentence",
    requiredOpening: null,
    options: mcq
      ? [
          { id: "a", text: adverb },
          { id: "b", text: adjective },
          { id: "c", text: noun },
          { id: "d", text: root === "CARE" ? "caring" : adverb + "ness" },
        ]
      : [],
    correctOptionId: mcq ? "a" : null,
    distractorExplanations: mcq
      ? (["b", "c", "d"] as const).map((optionId) => ({
          optionId,
          explanationVi:
            "Dạng này không phải Adverb phù hợp để bổ nghĩa cho Verb work.",
        }))
      : [],
  };
}
export function questionFixture(
  sessionId: string,
  item: PlanItem,
  salt = 0,
): PrivateQuestion {
  const content = contentFixture(item, salt);
  const tokens = content.referenceAnswers[0].split(" ");
  tokens.push(tokens.shift()!);
  return {
    ...content,
    ...(item.exerciseType === "sentence_reordering"
      ? {
          questionText: tokens.join(" / "),
          reorderTokens: tokens,
          instruction: "Arrange all the words into a grammatical sentence.",
        }
      : {}),
    ...item,
    id: crypto.randomUUID(),
    sessionId,
    difficulty: "B2",
    generationVersion: 1,
  };
}
export function auditFixture(questions: PrivateQuestion[]) {
  return {
    verdicts: questions.map((q) => ({
      ordinal: q.ordinal,
      checks: Array.from({ length: 9 }, () => true),
      confidence: 0.98,
    })),
  };
}
