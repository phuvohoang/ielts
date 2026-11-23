import {
  candidateSchema,
  type Candidate,
  type Knowledge,
  type checksSchema,
} from "./schema";
export const normalize = (v: string) =>
  v
    .normalize("NFKC")
    .trim()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
const canonical = (v: string) =>
  normalize(v)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function deterministicIssues(
  raw: unknown,
  patterns: Knowledge[],
): string[] {
  const parsed = candidateSchema.safeParse(raw);
  if (!parsed.success) return ["schema"];
  const q = parsed.data,
    issues: string[] = [];
  const answers = [q.expectedAnswer, ...q.acceptedAlternatives];
  const ids = new Set(
    patterns.filter((p) => p.verification === "verified").map((p) => p.id),
  );
  if (
    q.testedPatternIds.some((id) => !ids.has(id)) ||
    new Set(q.testedPatternIds).size !== q.testedPatternIds.length
  )
    issues.push("unverified_target");
  if (
    patterns.some(
      (p) => q.testedPatternIds.includes(p.id) && p.cefr !== q.difficulty,
    )
  )
    issues.push("difficulty");
  if (new Set(answers.map(normalize)).size !== answers.length)
    issues.push("duplicate_answers");
  if (
    ["word_formation", "collocation"].includes(q.format) &&
    !patterns.some(
      (p) => q.testedPatternIds.includes(p.id) && p.kind !== "grammar",
    )
  )
    issues.push("unsupported_target_format");
  if (q.format === "multiple_choice") {
    if (
      q.options.length !== 4 ||
      new Set(q.options.map(normalize)).size !== 4 ||
      !q.options.some((o) => normalize(o) === normalize(q.expectedAnswer)) ||
      q.acceptedAlternatives.length
    )
      issues.push("choice_contract");
  } else if (q.options.length) issues.push("unexpected_options");
  if (
    ["multiple_choice", "fill_blank", "word_formation", "collocation"].includes(
      q.format,
    ) &&
    (q.question.match(/___/g) ?? []).length !== 1
  )
    issues.push("one_blank_required");
  if (
    ["error_correction", "sentence_transformation", "paraphrasing"].includes(
      q.format,
    )
  ) {
    if (q.question.includes("___")) issues.push("complete_source_required");
    if (answers.some((a) => canonical(a) === canonical(q.question)))
      issues.push("no_op");
    if (
      q.requiredOpening &&
      answers.some(
        (a) => !normalize(a).startsWith(normalize(q.requiredOpening)),
      )
    )
      issues.push("opening_mismatch");
    if (
      /\bbefore\b/i.test(q.question) &&
      /\bwithin\b/i.test(`${q.instructions} ${q.requiredOpening}`)
    )
      issues.push("before_within_meaning_shift");
    const numbers = (v: string) =>
      (v.match(/\d+(?:\.\d+)?/g) ?? []).sort().join(",");
    if (answers.some((a) => numbers(a) !== numbers(q.question)))
      issues.push("changed_numbers");
  } else if (q.requiredOpening) issues.push("unexpected_opening");
  if (
    answers.some((a) =>
      [q.question, q.instructions].some((v) =>
        normalize(v).includes(normalize(a)),
      ),
    )
  )
    issues.push("answer_leak");
  return issues;
}
export function publicQuestion(
  q: Candidate,
  checks: import("zod").z.infer<typeof checksSchema>,
) {
  const {
    expectedAnswer: _answer,
    acceptedAlternatives: _alternatives,
    explanationVi: _explanation,
    rubric: _rubric,
    ...visible
  } = q;
  return {
    ...visible,
    validation: {
      gateVersion: 1 as const,
      method: "deterministic_and_independent_ai" as const,
      checks,
    },
  };
}
