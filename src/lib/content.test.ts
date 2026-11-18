import { describe, it, expect } from "vitest";
import {
  families,
  questions,
  types,
  grade,
  normalize,
  shuffle,
} from "./content";
import curriculum from "../data/curriculum.json";
describe("curriculum and content integrity", () => {
  it("keeps only lesson 01 available", () => {
    expect(curriculum).toHaveLength(32);
    expect(curriculum.filter((l) => l.available).map((l) => l.id)).toEqual([1]);
  });
  it("has 25 unique families and at least 200 exercises across eight types", () => {
    expect(families).toHaveLength(25);
    expect(new Set(families.map((f) => f.id)).size).toBe(25);
    expect(questions.length).toBeGreaterThanOrEqual(200);
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
    expect(new Set(questions.map((q) => q.type))).toEqual(new Set(types));
    for (const q of questions) {
      expect(families.some((f) => f.id === q.family)).toBe(true);
      expect(q.explanation.length).toBeGreaterThan(15);
      expect(q.answers.every((a) => a.trim().length > 0)).toBe(true);
      if (q.choices.length) expect(q.choices).toContain(q.answers[0]);
    }
  });
  it("balances recognition and production at 30/70", () => {
    expect(
      questions.filter((q) => q.choices.length).length / questions.length,
    ).toBe(0.3);
  });
  it("does not invent empty adverb forms", () => {
    expect(families.find((f) => f.root === "develop")?.forms.adverb).toEqual(
      [],
    );
    expect(
      families.find((f) => f.root === "employ")?.forms.noun.length,
    ).toBeGreaterThan(1);
  });
});
describe("fair grading", () => {
  it("accepts normalized variants and every reference answer", () => {
    for (const q of questions)
      for (const a of q.answers)
        expect(grade(q, "  " + a.toUpperCase() + "! ")).toBe("correct");
    expect(normalize("  Hello,   world!")).toBe("hello world");
  });
  it("keeps uncertain free text for review", () => {
    const q = questions.find((q) => q.requiresReview)!;
    expect(grade(q, "Another potentially valid sentence.")).toBe("review");
    expect(
      grade(
        questions.find((q) => !q.requiresReview)!,
        "wrong",
      ),
    ).toBe("incorrect");
  });
  it("shuffles without mutating or losing questions", () => {
    const source = [1, 2, 3, 4];
    const out = shuffle(source, () => 0);
    expect(out.slice().sort()).toEqual(source);
    expect(out).not.toEqual(source);
    expect(source).toEqual([1, 2, 3, 4]);
  });
});
