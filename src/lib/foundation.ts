import { z } from "zod";
import moduleData from "../data/foundation/modules.json";
import theoryData from "../data/foundation/theory.json";
import {
  learningProgressSchema,
  type LearningProgress,
} from "./learning-model";
const outline = z.object({
  id: z.string(),
  title: z.string(),
  available: z.boolean(),
  grammar_rule_id: z.string(),
  prerequisite_lesson_ids: z.array(z.string()),
});
export const modules = z
  .array(
    z.object({
      id: z.string(),
      title: z.string(),
      available: z.boolean(),
      lessons: z.array(outline),
    }),
  )
  .parse(moduleData);
export const lessonOutlines = modules.flatMap((m) => m.lessons);
export const theories = z
  .array(
    z.object({
      id: z.string(),
      what: z.string().min(100),
      why: z.string().min(100),
      when: z.string().min(100),
      exceptions: z.string().min(100),
      mistakes: z.array(z.tuple([z.string(), z.string(), z.string()])).min(3),
      examples: z.array(z.tuple([z.string(), z.string(), z.string()])).min(3),
      hint: z.string(),
    }),
  )
  .parse(theoryData);
export const lessonById = new Map(lessonOutlines.map((l) => [l.id, l]));
export function theoryLearned(id: string, progress: LearningProgress[]) {
  const p = progress.find((x) => x.id === id);
  return (
    !!p?.completed.includes("understand") && !!lessonById.get(id)?.available
  );
}
export function canStudy(id: string, progress: LearningProgress[]) {
  const l = lessonById.get(id);
  return (
    !!l?.available &&
    l.prerequisite_lesson_ids.every((pre) => theoryLearned(pre, progress))
  );
}
export function canPractise(
  q: { grammar_rule_ids?: string[]; prerequisite_lesson_ids?: string[] },
  progress: LearningProgress[],
) {
  return (
    !!q.grammar_rule_ids?.length &&
    q.grammar_rule_ids.every((id) => theoryLearned(id, progress)) &&
    !!q.prerequisite_lesson_ids?.length &&
    q.prerequisite_lesson_ids.every((id) => theoryLearned(id, progress))
  );
}
// Older activity is evidence of practice, not evidence that theory was studied.
export function validateLearningProgress(input: unknown) {
  return z.array(learningProgressSchema).parse(input);
}
