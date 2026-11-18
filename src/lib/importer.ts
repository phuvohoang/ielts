import { z } from "zod";
import { types, questionSchema, type familySchema } from "./schemas";
export const sourceTypes = [
  "identify_word_class",
  "word_formation",
  "fill_in_blank",
  "error_detection",
  "sentence_correction",
  "sentence_building",
  "vietnamese_to_english",
  "writing_error_recall",
] as const;
export const sourceSchema = z.object({
  schema_version: z.literal("1.0"),
  title: z.string(),
  count: z.literal(300),
  questions: z
    .array(
      z.object({
        id: z.string().regex(/^PSWF-\d{3}$/),
        lesson: z.literal("01"),
        type: z.enum(sourceTypes),
        topic: z.string().min(1),
        level: z.enum(["B1", "B2"]),
        rule_id: z.string(),
        prompt: z.string().min(1),
        answer: z.array(z.string().min(1)).min(1),
        explanation_vi: z.string().min(1),
        review_priority: z.number(),
        options: z.array(z.string()).optional(),
        meta: z
          .object({
            tokens: z.array(z.string()).optional(),
            root: z.string().optional(),
            grading: z.string().optional(),
            reference_only: z.boolean().optional(),
            corrected_segment_hint: z.string().optional(),
            source: z.string().optional(),
          })
          .optional(),
      }),
    )
    .length(300),
});
export const quarantine = {
  "PSWF-122":
    "The reference targets informations, but replacing it with singular information also requires are → is; a single-segment task has interacting errors.",
  "PSWF-152":
    "Entered into the room is an attested grammatical construction; the task treats an optional preposition/style change as an error.",
  "PSWF-192":
    "The original sentence can already be grammatical; it should not be a mandatory error-correction question.",
  "PSWF-271":
    "The reference changes work permit to work visa. These are not guaranteed to have the same legal meaning.",
  "PSWF-275":
    "A basic skill in English can refer to one skill and is grammatical. Requiring plural skills changes the intended scope.",
};
export const quarantinedIds = new Set(Object.keys(quarantine));
export const extraAnswers: Record<string, string[]> = {
  "PSWF-041": ["clearness"],
  "PSWF-070": ["continually"],
  "PSWF-052": ["inequalities"],
  "PSWF-055": ["unfairness"],
  "PSWF-059": ["automatic"],
  "PSWF-060": ["insignificant"],
  "PSWF-061": ["insignificantly"],
  "PSWF-093": ["effectual"],
  "PSWF-094": ["ineffectively"],
  "PSWF-096": ["inefficiently"],
  "PSWF-101": ["analytic"],
  "PSWF-110": ["simplified"],
  "PSWF-080": ["creation", "creations"],
  "PSWF-097": ["insignificant"],
  "PSWF-106": ["unrealistic"],
  "PSWF-114": ["confusing"],
  "PSWF-176": ["He gave me some advice."],
  "PSWF-289": ["I made a good improvement this month."],
};
export const ambiguityNotes: Record<string, string> = {
  "PSWF-041": "Clarity is the usual answer; clearness is also a valid noun.",
  "PSWF-070":
    "Continuously and continually are both grammatical here, with different nuances.",
  "PSWF-072":
    "The prompt lacks enough context to reject all other REAL-family adjectives. Unmatched answers need review.",
  "PSWF-080":
    "Creativity, creation and creations can all fit this context. They express different meanings.",
  "PSWF-097":
    "Significant and insignificant are both grammatical; the prompt does not specify positive or negative meaning.",
  "PSWF-106":
    "Realistic and unrealistic are both grammatical given an unspecified budget.",
  "PSWF-114":
    "Confused describes a feeling; confusing can describe people who cause confusion. The prompt does not specify which meaning.",
  "PSWF-176":
    "A piece of advice is the reference; some advice is also grammatical. Other valid corrections need review.",
  "PSWF-289":
    "A good improvement is grammatical; an adjective such as significant is not mandatory. The original explanation is preserved as supplied.",
  "PSWF-038":
    "Qualified is treated as an adjective describing eligibility in this context; participial uses depend on context.",
};
const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const sentence = (s: string) =>
  key(
    s
      .slice(s.indexOf(":") + 1)
      .replace(/\//g, " ")
      .replace(/\[.*?\]|\(.*?\)/g, ""),
  );
export function adaptImport(
  input: unknown,
  families: z.infer<typeof familySchema>[],
) {
  const bank = sourceSchema.parse(input);
  const ids = new Set(bank.questions.map((q) => q.id));
  if (
    ids.size !== 300 ||
    Array.from(
      { length: 300 },
      (_, i) => `PSWF-${String(i + 1).padStart(3, "0")}`,
    ).some((id) => !ids.has(id))
  )
    throw Error("Import requires exactly PSWF-001 through PSWF-300, once each");
  const corrections = new Map(
    bank.questions
      .filter((q) => q.type === "sentence_correction")
      .map((q) => [sentence(q.prompt), key(q.answer[0])]),
  );
  return [...bank.questions]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((q) => {
      const type = types[sourceTypes.indexOf(q.type)];
      const choices = q.options ?? [];
      if (choices.length && q.answer.some((a) => !choices.includes(a)))
        throw Error(`Invalid choice answer: ${q.id}`);
      if (q.type === "error_detection" && choices.length !== 4)
        throw Error(`Expected four segments: ${q.id}`);
      if (q.type === "identify_word_class" && !/\[\[.+?\]\]/.test(q.prompt))
        throw Error(`Missing target: ${q.id}`);
      if (q.type === "sentence_building") {
        const tokens = q.meta?.tokens;
        const tokenKey = (words: string[]) =>
          words
            .join(" ")
            .toLowerCase()
            .replace(/[^\p{L}\p{N}'\s]/gu, " ")
            .split(/\s+/)
            .filter(Boolean)
            .sort()
            .join("|");
        if (
          !tokens?.length ||
          q.answer.some((answer) => tokenKey(tokens) !== tokenKey([answer]))
        )
          throw Error(`Token mismatch: ${q.id}`);
      }
      const hint =
        q.meta?.root ??
        q.prompt.match(/\[.*?from ([A-Z]+)\]/)?.[1] ??
        q.prompt.match(/\[\[(.*?)\]\]/)?.[1] ??
        q.answer[0];
      const family =
        families.find((f) =>
          [f.root, ...Object.values(f.forms).flat()].some(
            (word) => key(word) === key(hint),
          ),
        ) ??
        families.find((f) =>
          Object.values(f.forms)
            .flat()
            .some((word) => new RegExp(`\\b${word}\\b`, "i").test(q.answer[0])),
        );
      return questionSchema.parse({
        id: q.id,
        family: family?.id ?? "",
        type,
        prompt: q.prompt,
        answers: [...new Set([...q.answer, ...(extraAnswers[q.id] ?? [])])],
        explanation: q.explanation_vi,
        difficulty: q.level,
        topic: q.topic,
        choices,
        requiresReview: !choices.length || !!ambiguityNotes[q.id],
        ruleId: q.rule_id,
        rootHint: ["word_formation", "fill_in_blank"].includes(q.type)
          ? (q.meta?.root ?? q.prompt.match(/\[.*?from ([A-Z]+)\]/)?.[1])
          : undefined,
        tokens: q.meta?.tokens,
        group:
          corrections.get(sentence(q.prompt)) ??
          (q.type === "sentence_building" || sourceTypes.indexOf(q.type) >= 4
            ? key(q.answer[0])
            : sentence(q.prompt)),
        auditNote:
          ambiguityNotes[q.id] ??
          (extraAnswers[q.id]
            ? `Additional audited answers: ${extraAnswers[q.id].join("; ")}. The supplied explanation describes the original reference.`
            : undefined),
      });
    });
}
