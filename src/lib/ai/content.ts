import raw from "../../data/grammar-b2.json";
import { exerciseSchema } from "./schema";
import { z } from "zod";
export const b2Exercises = z.array(exerciseSchema).parse(raw);
export const exerciseById = new Map(b2Exercises.map((q) => [q.id, q]));

// Interleave family contrasts, sentence transformations and context forms.
export const mixedB2Exercises = Array.from({ length: 10 }, (_, i) => [
  b2Exercises.filter((q) => q.part === "A")[i],
  b2Exercises.filter((q) => q.part === "C")[i],
  b2Exercises.filter((q) => q.part === "B")[i],
])
  .flat()
  .filter((q): q is (typeof b2Exercises)[number] => !!q);
