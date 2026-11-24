import data from "../data/guided/present-tenses.json";
import { exerciseSchema } from "./ai/schema";
export const guidedLesson = data;
export const guidedSessionId = `guided:${data.id}`;
export const lessonGrounding = {
  id: data.id,
  title: data.title,
  objectives: data.objectives,
  rules: [
    "Present simple expresses regular routines, general facts, opinions and states. With a singular third-person subject, use verb+s/es; after does/does not use the base verb.",
    "Present continuous uses am/is/are + V-ing for activities in progress, temporary arrangements and developing trends. Do not omit be.",
    "Know, own, believe and understand normally express states. Think, have and taste can express either a state or an activity depending on meaning. Never categorically ban all continuous uses.",
    "Context determines aspect. Usually/now are clues, not automatic rules. Two grammatical sentences can convey different habitual/temporary meanings.",
    "Keep participant, polarity, time, frequency, degree and intended meaning unchanged in a correction. Do not force affirmative-to-negative or before-to-within equivalence.",
    "Use ordinary General Training contexts: work schedules, courses, housing, local services and polite requests. A stylistic alternative is not a grammatical error.",
  ],
};
export const guidedExercises = data.questions.map((q) =>
  exerciseSchema.parse({
    id: q.id,
    version: 1,
    lessonId: data.id,
    type:
      q.kind === "correction"
        ? "error_correction"
        : q.kind === "rewrite"
          ? "sentence_transformation"
          : q.kind === "guided" || q.kind === "writing"
            ? "guided_writing"
            : q.kind === "translation"
              ? "sentence_building"
              : "fill_blank",
    difficulty: Number(q.id.slice(-2)) <= 12 ? "B1" : "B2",
    part:
      Number(q.id.slice(-2)) <= 12
        ? "A"
        : Number(q.id.slice(-2)) <= 22
          ? "B"
          : "C",
    question: q.prompt,
    instruction: q.instruction,
    referenceAnswers: [q.answers[0]],
    acceptedVariants: q.answers.slice(1),
    grammarRules: lessonGrounding.rules.filter((_, i) =>
      q.rule === "present-simple"
        ? i === 0
        : q.rule === "present-continuous"
          ? i === 1
          : q.rule === "state-verbs"
            ? i === 2 || i === 3
            : i === 0 || i === 1 || i === 3,
    ),
    targetSkills: [q.rule],
    explanation: q.explanationVi,
    rubric: `${q.instruction} Accept all grammatically correct alternatives preserving the required meaning and information; reference answers are non-exhaustive. Distinguish actual errors from optional style. ${q.kind === "writing" ? data.writingRubric.join(" ") : ""}`,
    objective: q.kind === "choice" || q.kind === "blank",
  }),
);
