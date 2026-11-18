import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { families, questions, grade, shuffle } from "./content";
import { schedule, intervals } from "./schedule";
import { db, record, exportBackup, importBackup } from "./db";
describe("curriculum content", () => {
  it("has 25 unique families and at least 200 valid exercises", () => {
    expect(families).toHaveLength(25);
    expect(new Set(families.map((f) => f.id)).size).toBe(25);
    expect(questions.length).toBeGreaterThanOrEqual(200);
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
    expect(new Set(questions.map((q) => q.type)).size).toBe(8);
    for (const q of questions) {
      expect(families.some((f) => f.id === q.family)).toBe(true);
      expect(q.answers.every((a) => a.trim().length > 0)).toBe(true);
      if (q.choices.length) expect(q.choices).toContain(q.answers[0]);
    }
  });
  it("accepts punctuation and case but defers uncertain writing", () => {
    const q = questions.find((q) => q.type === "Sentence Building")!;
    expect(grade(q, q.answers[0].toUpperCase() + "!")).toBe("correct");
    expect(grade(q, "unrelated")).toBe("review");
    expect(
      grade(
        questions.find((q) => q.requiresReview)!,
        "A valid alternative sentence.",
      ),
    ).toBe("review");
  });
  it("shuffles without mutating or losing items", () => {
    const a = [1, 2, 3, 4];
    expect(shuffle(a, () => 0)).not.toEqual(a);
    expect(a).toEqual([1, 2, 3, 4]);
    expect(shuffle(a).sort()).toEqual(a);
  });
});
describe("deterministic review schedule", () => {
  it("advances through all six intervals, then caps", () => {
    let p;
    for (let i = 0; i < 8; i++) {
      p = schedule(p, "f01", true, 0);
      expect(p.next).toBe(intervals[Math.min(i, 5)] * 86400000);
    }
    expect(p!.mastered).toBe(true);
  });
  it("resets a failed word for earlier review", () => {
    const p = schedule(schedule(undefined, "f01", true, 0), "f01", false, 100);
    expect(p.next).toBe(600100);
    expect(p.streak).toBe(0);
    expect(p.mastered).toBe(false);
    expect(p.incorrect).toBe(1);
  });
});
describe("local persistence and backups", () => {
  beforeEach(async () => {
    await db.attempts.clear();
    await db.progress.clear();
    await db.writing.clear();
  });
  it("persists attempts and schedules atomically, excluding uncertain grading", async () => {
    await record({
      questionId: "q001",
      family: "f01",
      type: "Identify Word Class",
      answer: "adjective",
      result: "correct",
      date: 1000,
    });
    expect(await db.attempts.count()).toBe(1);
    expect((await db.progress.get("f01"))?.next).toBe(86401000);
    await record({
      questionId: "q007",
      family: "f01",
      type: "Vietnamese to English",
      answer: "Alternative",
      result: "review",
      date: 2000,
    });
    expect((await db.progress.get("f01"))?.reviews).toBe(1);
  });
  it("rejects invalid imports without clearing existing data and round-trips", async () => {
    await record({
      questionId: "q001",
      family: "f01",
      type: "Identify Word Class",
      answer: "adjective",
      result: "correct",
      date: 1000,
    });
    const backup = await exportBackup();
    await expect(importBackup({ version: 2 })).rejects.toThrow();
    expect(await db.attempts.count()).toBe(1);
    await importBackup(backup);
    expect(await exportBackup()).toEqual(backup);
  });
});
