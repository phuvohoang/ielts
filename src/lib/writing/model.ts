import {
  assessmentOutputSchema,
  assessmentSchema,
  type Assessment,
  type Pattern,
  type ReviewExercise,
  type ReviewGrade,
} from "./schema";
const DAY = 86400000;
export function parseAssessment(
  input: {
    essayId: string;
    task: "task1" | "task2";
    prompt: string;
    essay: string;
  },
  raw: unknown,
  now: number,
): Assessment {
  const value = assessmentOutputSchema.parse(raw);
  let quarantined = 0;
  const issues = value.issues.flatMap((issue, index) => {
    const positions: number[] = [];
    for (
      let at = input.essay.indexOf(issue.original);
      at >= 0;
      at = input.essay.indexOf(issue.original, at + 1)
    )
      positions.push(at);
    const start = positions[issue.occurrence - 1];
    if (
      start === undefined ||
      issue.original === issue.correction ||
      issue.alternatives.includes(issue.original)
    ) {
      quarantined++;
      return [];
    }
    return [
      {
        ...issue,
        id: `${input.essayId}:${index}`,
        start,
        end: start + issue.original.length,
        status: "pending" as const,
      },
    ];
  });
  const scores = Object.values(value.criteria).map((c) => c.band);
  return assessmentSchema.parse({
    ...value,
    id: input.essayId,
    task: input.task,
    prompt: input.prompt,
    originalEssay: input.essay,
    createdAt: now,
    issues,
    quarantined,
    bandEstimate:
      value.confidence < 0.75
        ? null
        : Math.round((scores.reduce((a, b) => a + b, 0) / 4) * 2) / 2,
  });
}
const aliases: Record<string, string> = {
  third_person_singular_s: "third_person_singular",
  present_simple_third_person: "third_person_singular",
  subject_verb_agreement_third_person: "third_person_singular",
};
export function patternKey(category: string, ruleId: string) {
  return `${category}:${aliases[ruleId] ?? ruleId}`;
}
export function schedulePattern(
  pattern: Pattern,
  exercise: ReviewExercise,
  grade: ReviewGrade,
  now: number,
): Pattern {
  if (grade.status === "needs_review" || grade.confidence < 0.8) return pattern;
  if (grade.status === "incorrect")
    return {
      ...pattern,
      status: "learning",
      streak: 0,
      intervalDays: 1,
      dueAt: now + DAY,
      lapses: pattern.lapses + 1,
      successfulContexts: [],
      successfulDays: [],
      freeWritingPassed: false,
      updatedAt: now,
    };
  // Extra practice is recorded, but correct reviews before the due date do not accelerate mastery.
  if (pattern.dueAt > now) return pattern;
  const contextual = grade.contextualEvidence && exercise.level >= 3;
  const successfulContexts = contextual
    ? [
        ...new Set([
          ...pattern.successfulContexts,
          exercise.context
            .normalize("NFKC")
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase(),
        ]),
      ]
    : pattern.successfulContexts;
  const successfulDays = contextual
    ? [
        ...new Set([
          ...pattern.successfulDays,
          new Date(now).toISOString().slice(0, 10),
        ]),
      ]
    : pattern.successfulDays;
  const freeWritingPassed =
    pattern.freeWritingPassed || (contextual && exercise.level === 4);
  const streak = pattern.streak + 1;
  const intervalDays = [1, 3, 7, 14, 30, 60][Math.min(streak - 1, 5)];
  return {
    ...pattern,
    streak,
    intervalDays,
    dueAt: now + intervalDays * DAY,
    status:
      successfulContexts.length >= 3 &&
      successfulDays.length >= 2 &&
      freeWritingPassed
        ? "mastered"
        : "reviewing",
    successfulContexts,
    successfulDays,
    freeWritingPassed,
    updatedAt: now,
  };
}
