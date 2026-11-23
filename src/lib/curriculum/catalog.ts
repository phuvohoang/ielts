import { grammarKnowledgeSchema, type Knowledge } from "./schema";
export const books = [
  {
    id: "grammar-ielts",
    title: "Grammar for IELTS",
    status: "Unit 1 đã đối chiếu trực quan",
  },
  {
    id: "collocations-intermediate",
    title: "Collocations Intermediate",
    status: "Chưa xác minh bài học",
  },
  {
    id: "vocabulary-advanced",
    title: "Vocabulary for IELTS Advanced",
    status: "Cần OCR và xác minh",
  },
];
export const unit = {
  id: "grammar-ielts-1",
  bookId: "grammar-ielts",
  number: 1,
  title: "Present tenses",
  topics: ["Present simple", "Present continuous", "State verbs"],
};
const source = {
  bookId: unit.bookId,
  sha256: "18405d447913ca58a6be56ba4f57ab6555dd0a491d893b9ea96c77e0940a4a36",
  pdfPages: [14, 15, 16],
  printedPages: "1–3",
  method: "visual_review" as const,
  reviewedOn: "2026-11-23",
};
const shared = {
  unitId: unit.id,
  cefr: "B1" as const,
  skills: ["writing", "reading", "listening"] as const,
  sources: [source],
  verification: "verified" as const,
  authorship: "independently_authored" as const,
  kind: "grammar" as const,
};
export const knowledge: Knowledge[] = [
  {
    ...shared,
    id: "present-simple",
    title: "Thói quen và trạng thái ổn định",
    ruleIds: [
      "present_simple",
      "third_person_singular",
      "third_person_singular_s",
      "present_simple_third_person",
      "subject_verb_agreement_third_person",
    ],
    explanationVi:
      "Dùng hiện tại đơn cho thói quen, sự thật và tình trạng ổn định. Với he/she/it, động từ khẳng định thường thêm -s/-es. Sau does/does not, dùng động từ nguyên thể. Chọn thì theo ý nghĩa toàn câu, không chỉ theo một trạng từ.",
    objectivesVi: [
      "Mô tả lịch sinh hoạt hoặc dịch vụ thường lệ.",
      "Dùng đúng động từ với chủ ngữ số ít.",
    ],
    examples: [
      "The community library opens at nine on weekdays.",
      "My colleague does not drive to work.",
    ],
    commonMistakesVi: [
      "The library open → The library opens.",
      "Does she works? → Does she work?",
    ],
    alternatives: ["I do not drive.", "I don't drive."],
  },
  {
    ...shared,
    id: "present-continuous",
    title: "Việc đang diễn ra và tình huống tạm thời",
    ruleIds: ["present_continuous", "present_progressive", "temporary_present"],
    explanationVi:
      "Dùng am/is/are + V-ing cho hoạt động đang diễn ra, hoàn cảnh tạm thời và xu hướng đang thay đổi. Nêu rõ ngữ cảnh để phân biệt với thói quen. Không ép đổi hiện tại đơn sang tiếp diễn nếu việc đó làm thay đổi ý nghĩa.",
    objectivesVi: [
      "Mô tả một thay đổi tạm thời trong thư Task 1.",
      "Phân biệt việc thường lệ và việc đang diễn ra.",
    ],
    examples: [
      "I am staying with a colleague while my flat is being repaired.",
      "More residents are using the new cycle lane this month.",
    ],
    commonMistakesVi: [
      "I staying → I am staying.",
      "Không thay mọi hiện tại đơn bằng hiện tại tiếp diễn.",
    ],
    alternatives: [
      "I am working from home this week.",
      "I'm working from home this week.",
    ],
  },
  {
    ...shared,
    id: "state-verbs",
    title: "Động từ trạng thái theo nghĩa",
    ruleIds: ["state_verbs", "stative_verbs", "stative_verb_continuous"],
    explanationVi:
      "Các động từ như know, own và believe thường diễn tả trạng thái nên thường dùng dạng đơn. Một số động từ có cả nghĩa trạng thái và hành động: think có thể là có ý kiến hoặc đang suy xét; have có thể là sở hữu hoặc trải nghiệm. Phải xét nghĩa trước khi sửa.",
    objectivesVi: [
      "Dùng know/own ở dạng đơn khi diễn tả trạng thái.",
      "Chấp nhận dạng tiếp diễn khi động từ mang nghĩa hành động phù hợp.",
    ],
    examples: [
      "I know the route to the training centre.",
      "We are thinking about renting a smaller office.",
    ],
    commonMistakesVi: [
      "I am knowing → I know.",
      "Không coi mọi câu có 'are thinking' là sai.",
    ],
    alternatives: [
      "I think the fee is reasonable.",
      "I believe the fee is reasonable.",
    ],
  },
].map((record) => grammarKnowledgeSchema.parse(record));
export function verifiedPatterns(ids: string[], unitId: string) {
  if (new Set(ids).size !== ids.length) throw Error("Duplicate patterns");
  return ids.map((id) => {
    const pattern = knowledge.find(
      (p) =>
        p.id === id && p.unitId === unitId && p.verification === "verified",
    );
    if (!pattern) throw Error("Unverified pattern");
    return pattern;
  });
}
export function knowledgeForRule(ruleId: string) {
  return knowledge.find(
    (p) => p.kind === "grammar" && p.ruleIds.includes(ruleId),
  );
}
