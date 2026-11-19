// Synthetic test fixtures, never imported by the app or Worker.
import type { PrivateContent, PracticeResult } from "./schema";
export function contentFixture(skill = "reading"): PrivateContent {
  const source = "The community centre opens at nine in the morning. "
    .repeat(skill === "listening" ? 14 : 25)
    .trim();
  return {
    title: "Community centre information",
    instructionsVi: "Trả lời năm câu dựa trên nội dung bài.",
    passage: skill === "reading" ? source : "",
    transcript: skill === "listening" ? source : "",
    writingPrompt:
      skill === "writing"
        ? "You recently attended an event at your local community centre. Write a letter to its manager. Explain why you attended, describe a problem you experienced, and suggest an improvement."
        : "",
    questions:
      skill === "writing"
        ? []
        : Array.from({ length: 5 }, (_, i) => ({
            number: i + 1,
            type: "short_answer" as const,
            prompt: "What time does the centre open?",
            options: [],
            wordLimit: 2,
            answers: ["nine"],
            evidence: "opens at nine",
            explanationVi: "Bài cho biết trung tâm mở cửa lúc chín giờ sáng.",
          })),
  };
}
export const writingFixture = {
  taskResponse: 6,
  coherence: 6.5,
  vocabulary: 6,
  grammar: 5.5,
  feedbackVi: "Bài nêu được mục đích nhưng cần phát triển yêu cầu thứ ba.",
  strengthsVi: ["Mục đích thư rõ ràng."],
  improvementsVi: ["Bổ sung một đề xuất cụ thể."],
  corrections: [
    {
      original: "I has attended",
      corrected: "I attended",
      reasonVi: "Dùng Past Simple cho sự kiện đã kết thúc.",
    },
  ],
  confidence: 0.9,
};
export function resultFixture(
  answers: Record<string, string>,
  writing = false,
): PracticeResult {
  return {
    items: writing
      ? []
      : Array.from({ length: 5 }, (_, i) => ({
          number: i + 1,
          status: "correct",
          feedbackVi: "Câu trả lời phù hợp với thông tin trong bài.",
          confidence: 0.95,
        })),
    score: writing ? null : 5,
    maxScore: writing ? 0 : 5,
    writing: writing ? writingFixture : null,
    bandEstimate: writing ? 6 : null,
    transcript: "",
    reveals: writing ? [] : contentFixture().questions,
    submittedAnswers: answers,
  };
}
export function wavFixture() {
  const bytes = new Uint8Array(4844),
    v = new DataView(bytes.buffer);
  for (const [offset, text] of [
    [0, "RIFF"],
    [8, "WAVE"],
    [12, "fmt "],
    [36, "data"],
  ] as const)
    for (let i = 0; i < text.length; i++)
      bytes[offset + i] = text.charCodeAt(i);
  v.setUint32(4, bytes.length - 8, true);
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 24000, true);
  v.setUint32(28, 48000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  v.setUint32(40, 4800, true);
  return bytes;
}
