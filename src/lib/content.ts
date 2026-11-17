import { z } from "zod";
import familyData from "../data/families.json";
import questionData from "../data/questions.json";
export const types = [
  "Identify Word Class",
  "Word Formation",
  "Fill in the Blank",
  "Error Detection",
  "Sentence Correction",
  "Sentence Building",
  "Vietnamese to English",
  "Writing Error Recall",
] as const;
export const familySchema = z.object({
  id: z.string(),
  root: z.string(),
  cefr: z.string(),
  topic: z.string(),
  forms: z.record(z.string(), z.array(z.string())),
  ipa: z.string(),
  meaning: z.string(),
  examples: z.array(z.string()),
  collocations: z.array(z.string()),
  verbPatterns: z.array(z.string()),
  mistakes: z.array(z.string()),
  rules: z.array(z.string()),
});
export const questionSchema = z.object({
  id: z.string(),
  family: z.string(),
  type: z.enum(types),
  prompt: z.string(),
  answers: z.array(z.string()).min(1),
  explanation: z.string(),
  difficulty: z.string(),
  topic: z.string(),
  choices: z.array(z.string()),
  requiresReview: z.boolean(),
});
export const families = z.array(familySchema).parse(familyData);
export const questions = z.array(questionSchema).parse(questionData);
export type Question = z.infer<typeof questionSchema>;
export function normalize(s: string) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function grade(
  q: Question,
  answer: string,
): "correct" | "incorrect" | "review" {
  if (q.answers.some((a) => normalize(a) === normalize(answer)))
    return "correct";
  return q.requiresReview ? "review" : "incorrect";
}
export function shuffle<T>(items: T[], random = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
