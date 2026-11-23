// Independently authored evaluation fixtures, reviewed against Unit 1 by the implementation agent.
// These are test data, not textbook questions and not evidence of human curriculum approval.
import type { Candidate } from "./schema";
export const allChecks = {
  grammar: true,
  semantics: true,
  instructions: true,
  targetPattern: true,
  alternatives: true,
  difficulty: true,
  unambiguous: true,
  natural: true,
};
const rows: Pick<
  Candidate,
  | "format"
  | "question"
  | "instructions"
  | "expectedAnswer"
  | "acceptedAlternatives"
  | "options"
  | "requiredOpening"
>[] = [
  {
    format: "multiple_choice",
    question: "The recycling centre ___ at eight every weekday.",
    instructions: "Choose the correct present simple verb.",
    expectedAnswer: "opens",
    acceptedAlternatives: [],
    options: ["open", "opens", "opening", "are open"],
    requiredOpening: "",
  },
  {
    format: "fill_blank",
    question:
      "Please wait a moment; the receptionist ___ (check) your booking right now.",
    instructions:
      "Complete the blank with the present continuous form of check.",
    expectedAnswer: "is checking",
    acceptedAlternatives: [],
    options: [],
    requiredOpening: "",
  },
  {
    format: "error_correction",
    question: "I am knowing the manager of this training centre.",
    instructions: "Correct the one verb error. Keep the meaning.",
    expectedAnswer: "I know the manager of this training centre.",
    acceptedAlternatives: [],
    options: [],
    requiredOpening: "",
  },
  {
    format: "sentence_transformation",
    question: "The local shop does not sell newspapers.",
    instructions: "Use the contracted negative form. Preserve the meaning.",
    expectedAnswer: "The local shop doesn't sell newspapers.",
    acceptedAlternatives: [],
    options: [],
    requiredOpening: "The local shop",
  },
  {
    format: "paraphrasing",
    question: "At this moment, the technician is repairing our lift.",
    instructions:
      "Move the time phrase to the end. Preserve the ongoing action.",
    expectedAnswer: "The technician is repairing our lift at this moment.",
    acceptedAlternatives: ["The technician is repairing our lift right now."],
    options: [],
    requiredOpening: "The technician",
  },
  {
    format: "translation",
    question: "Tôi tin rằng học phí này hợp lý.",
    instructions: "Translate into English using believe to express an opinion.",
    expectedAnswer: "I believe this tuition fee is reasonable.",
    acceptedAlternatives: ["I believe that this tuition fee is reasonable."],
    options: [],
    requiredOpening: "",
  },
  {
    format: "guided_writing",
    question:
      "Describe one service your neighbourhood library provides regularly.",
    instructions: "Write one complete sentence about a regular service.",
    expectedAnswer: "Our library runs a reading club every Saturday.",
    acceptedAlternatives: [],
    options: [],
    requiredOpening: "",
  },
  {
    format: "free_writing",
    question:
      "Your usual workspace is unavailable this week. Tell a colleague where you are working instead, what you are doing there today and how the temporary arrangement is going.",
    instructions: "Write 40–80 words in English.",
    expectedAnswer:
      "I am working in the community centre this week because our office is closed for repairs. Today I am preparing the monthly report with two colleagues. We are sharing a quiet room near the entrance. The arrangement is going well, although I miss the coffee machine in our usual office.",
    acceptedAlternatives: [],
    options: [],
    requiredOpening: "",
  },
  {
    format: "fill_blank",
    question: "My neighbour ___ (own) the small bakery beside the station.",
    instructions: "Complete the blank with the present simple form of own.",
    expectedAnswer: "owns",
    acceptedAlternatives: [],
    options: [],
    requiredOpening: "",
  },
  {
    format: "error_correction",
    question: "My supervisor check the safety equipment every morning.",
    instructions: "Correct one verb error. Keep the meaning.",
    expectedAnswer: "My supervisor checks the safety equipment every morning.",
    acceptedAlternatives: [],
    options: [],
    requiredOpening: "",
  },
];
export function goldQuestions(
  plan?: { id: string; patternId: string }[],
): Candidate[] {
  return rows.map((row, i) => ({
    ...row,
    id:
      plan?.[i].id ||
      `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    testedPatternIds: [
      plan?.[i].patternId ||
        ["present-simple", "present-continuous", "state-verbs"][i % 3],
    ],
    difficulty: "B1",
    explanationVi: [
      "Dùng hiện tại đơn cho thói quen, chú ý chủ ngữ số ít.",
      "Dùng be + V-ing cho hành động đang diễn ra hoặc tình huống tạm thời.",
      "Động từ trạng thái cần xét theo nghĩa; không tự động dùng dạng tiếp diễn.",
    ][i % 3],
    rubric:
      "Require the stated task and intended meaning; accept correct natural alternatives demonstrating the selected pattern.",
  }));
}
