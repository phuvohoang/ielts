import { z } from "zod";
export const parts = ["noun", "adjective", "adverb", "verb"] as const;
export type Part = (typeof parts)[number];
export const labels: Record<Part, string> = {
  noun: "Noun",
  adjective: "Adjective",
  adverb: "Adverb",
  verb: "Verb",
};
export const normalize = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();
const forms = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(120)
      .refine(
        (v) => /\p{L}/u.test(v) && !/[\u0000-\u001f]/.test(v),
        "Phải là từ tiếng Anh, không phải ký hiệu trống.",
      ),
  )
  .max(30)
  .transform((values) => [
    ...new Map(values.map((v) => [normalize(v), v])).values(),
  ]);
export const familyInputSchema = z
  .object({
    meaning_vi: z.string().trim().min(1, "Thiếu nghĩa tiếng Việt").max(500),
    noun: forms.default([]),
    adjective: forms.default([]),
    adverb: forms.default([]),
    verb: forms.default([]),
  })
  .strict()
  .refine(
    (v) => parts.some((p) => v[p].length),
    "Cần ít nhất một dạng từ; để [] cho dạng không có.",
  );
export type FamilyInput = z.output<typeof familyInputSchema>;
export const familySchema = z
  .object({
    id: z.string().uuid(),
    data: familyInputSchema,
    updatedAt: z.number(),
  })
  .strict();
export type Family = z.infer<typeof familySchema>;
const answerSchema = z
  .object({
    noun: z.string().max(500).optional(),
    adjective: z.string().max(500).optional(),
    adverb: z.string().max(500).optional(),
    verb: z.string().max(500).optional(),
  })
  .strict();
export type Answers = z.infer<typeof answerSchema>;
export const questionSchema = z.object({
  family: familySchema,
  order: z
    .array(z.enum(parts))
    .length(4)
    .refine((v) => new Set(v).size === 4),
  answers: answerSchema,
  checked: z.boolean(),
});
export type Question = z.infer<typeof questionSchema>;
export const runSchema = z
  .object({
    id: z.string().uuid(),
    createdAt: z.number(),
    updatedAt: z.number(),
    requested: z.union([
      z.literal(10),
      z.literal(20),
      z.literal(30),
      z.literal(50),
      z.literal("all"),
    ]),
    pool: z.enum(["all", "selected", "incorrect"]),
    questions: z.array(questionSchema).min(1),
    index: z.number().int().min(0),
    completed: z.boolean(),
  })
  .refine(
    (r) =>
      r.index < r.questions.length &&
      new Set(r.questions.map((q) => q.family.id)).size ===
        r.questions.length &&
      (!r.completed || r.questions.every((q) => q.checked)),
    "Phiên luyện không hợp lệ.",
  );
export type Run = z.infer<typeof runSchema>;
export const weaknessSchema = z.object({
  familyId: z.string().uuid(),
  incorrect: z
    .array(z.enum(parts))
    .max(4)
    .refine((v) => new Set(v).size === v.length),
  updatedAt: z.number(),
});
export type Weakness = z.infer<typeof weaknessSchema>;
export function grade(question: Question) {
  return parts
    .filter((p) => question.family.data[p].length)
    .map((part) => ({
      part,
      answer: question.answers[part] ?? "",
      accepted: question.family.data[part],
      correct: question.family.data[part].some(
        (a) => normalize(a) === normalize(question.answers[part] ?? ""),
      ),
    }));
}
export function summarize(run: Run) {
  const checked = run.questions.filter((q) => q.checked);
  const graded = checked.flatMap((q) =>
    grade(q).map((item) => ({
      ...item,
      familyId: q.family.id,
      meaning: q.family.data.meaning_vi,
    })),
  );
  const score = graded.filter((x) => x.correct).length,
    total = graded.length;
  return {
    score,
    total,
    accuracy: total ? Math.round((score / total) * 100) : 0,
    fullyCorrect: checked.filter((q) => grade(q).every((x) => x.correct))
      .length,
    byPart: parts.map((part) => {
      const rows = graded.filter((x) => x.part === part);
      return {
        part,
        score: rows.filter((x) => x.correct).length,
        total: rows.length,
      };
    }),
    incorrect: graded.filter((x) => !x.correct),
  };
}
function unitRandom() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}
export function shuffle<T>(values: readonly T[], random = unitRandom): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function createRun(
  families: Family[],
  requested: Run["requested"],
  pool: Run["pool"],
  random = unitRandom,
): Run {
  const unique = [...new Map(families.map((f) => [f.id, f])).values()];
  if (!unique.length) throw Error("Chưa có word family phù hợp để luyện.");
  const selected = shuffle(unique, random).slice(
    0,
    requested === "all" ? unique.length : requested,
  );
  // Clock reads record persisted history timestamps, never render keys or animation.
  const now = Date.now();
  return runSchema.parse({
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    requested,
    pool,
    index: 0,
    completed: false,
    questions: selected.map((family) => ({
      family,
      order: shuffle(parts, random),
      answers: {},
      checked: false,
    })),
  });
}
export function englishKey(data: FamilyInput) {
  return JSON.stringify(parts.map((p) => data[p].map(normalize).sort()));
}
export function duplicate(data: FamilyInput, existing: FamilyInput[]) {
  return existing.some(
    (row) =>
      normalize(row.meaning_vi) === normalize(data.meaning_vi) ||
      englishKey(row) === englishKey(data),
  );
}

export function duplicateIndex(existing: FamilyInput[]) {
  const meanings = new Set(existing.map((row) => normalize(row.meaning_vi)));
  const words = new Set(existing.map(englishKey));
  return {
    has: (data: FamilyInput) =>
      meanings.has(normalize(data.meaning_vi)) || words.has(englishKey(data)),
    add: (data: FamilyInput) => {
      meanings.add(normalize(data.meaning_vi));
      words.add(englishKey(data));
    },
  };
}

export const selectionSchema = z
  .object({ familyId: z.string().uuid() })
  .strict();
export type Selection = z.infer<typeof selectionSchema>;
export function selectedFamilies(families: Family[], selections: Selection[]) {
  const ids = new Set(selections.map((s) => s.familyId));
  return families.filter((f) => ids.has(f.id));
}
export function practiceFamilies(
  families: Family[],
  pool: Run["pool"],
  selections: Selection[],
  incorrectIds: Set<string>,
  ids?: Set<string>,
) {
  const available =
    pool === "selected"
      ? selectedFamilies(families, selections)
      : ids || pool === "all"
        ? families
        : families.filter((f) => incorrectIds.has(f.id));
  return ids ? available.filter((f) => ids.has(f.id)) : available;
}
