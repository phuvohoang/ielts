import type { z } from "zod";
import type { assessmentOutputSchema } from "./schema";
export const essayFixture =
  "  I has attended the event and would like to suggest a change.\n";
export const taskFixture =
  "Write a letter to the manager about an event, a problem and an improvement.";
export function assessmentFixture(): z.infer<typeof assessmentOutputSchema> {
  return {
    criteria: {
      task: { band: 6.5, feedbackVi: "Mục đích rõ; cần phát triển đề xuất." },
      coherence: { band: 6, feedbackVi: "Liên kết các ý rõ hơn." },
      lexical: { band: 6, feedbackVi: "Từ vựng phù hợp với thư." },
      grammar: {
        band: 5.5,
        feedbackVi: "Cần sửa dạng động từ trong câu mở đầu.",
      },
    },
    summaryVi: "Mục đích rõ, cần thêm chi tiết và sửa cấu trúc động từ.",
    strengthsVi: ["Mục đích thư rõ ràng."],
    revisedEssay: "I attended the event and would like to suggest a change.",
    omissions: [
      {
        requirement: "Suggest an improvement",
        explanationVi: "Chưa nêu đề xuất cụ thể.",
        suggestionVi: "Thêm một giải pháp khả thi.",
      },
    ],
    issues: [
      {
        original: "I has attended",
        occurrence: 1,
        correction: "I attended",
        alternatives: ["I have attended"],
        explanationVi:
          "I không đi với has; chọn quá khứ đơn nếu sự kiện đã kết thúc.",
        targetPattern: "Subject and auxiliary agreement",
        ruleId: "subject_auxiliary_agreement",
        category: "grammar",
        severity: "major",
        kind: "error",
        confidence: 0.95,
      },
    ],
    confidence: 0.9,
  };
}
export function patternFixture(): import("./schema").Pattern {
  return {
    id: "grammar:subject_auxiliary_agreement",
    key: "grammar:subject_auxiliary_agreement",
    category: "grammar",
    ruleId: "subject_auxiliary_agreement",
    targetPattern: "Subject and auxiliary agreement",
    correction: "I attended",
    alternatives: ["I have attended"],
    explanationVi: "Chọn động từ phù hợp với chủ ngữ và ngữ cảnh.",
    severity: "major",
    status: "learning",
    evidenceIds: ["source:0"],
    essayIds: ["source"],
    originalExamples: ["I has attended"],
    createdAt: 1800000000000,
    updatedAt: 1800000000000,
    dueAt: 1800000000000,
    intervalDays: 0,
    streak: 0,
    lapses: 0,
    successfulContexts: [],
    successfulDays: [],
    freeWritingPassed: false,
  };
}
