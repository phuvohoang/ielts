import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, it, expect } from "vitest";
import { db, exportBackup, importBackup, record } from "./db";
import {
  foundationQuestions,
  allQuestions,
  questions,
  bankQuestions,
  grade,
} from "./content";
import {
  modules,
  theories,
  lessonById,
  canStudy,
  canPractise,
} from "./foundation";
import { lessonStatus } from "./learning-model";
import {
  startLesson,
  completeTheory,
  recordLearningAnswer,
  stageQuestions,
  beginMastery,
  finishMastery,
  verifyLearningAnswer,
} from "./learning";
const day = 86400000;
const id = "sf-complete-clause";
beforeEach(async () => {
  await db.attempts.clear();
  await db.progress.clear();
  await db.writing.clear();
  await db.lessons.clear();
  await db.checks.clear();
});
async function theory(lessonId: string, now: number) {
  await startLesson(lessonId, now);
  await completeTheory(lessonId, "learn", now);
  await completeTheory(lessonId, "understand", now);
}
async function stage(
  lessonId: string,
  name: "guided" | "independent" | "apply" | "review",
  now: number,
) {
  for (const q of stageQuestions(lessonId, name))
    await recordLearningAnswer(q.id, q.answers[0], { now });
}
async function ready(lessonId: string, now: number) {
  await theory(lessonId, now);
  for (const name of ["guided", "independent", "apply"] as const)
    await stage(lessonId, name, now);
  await stage(lessonId, "review", now + day);
}
describe("honest, rule-based curriculum", () => {
  it("has exactly the eight requested modules and four complete lessons in module one", () => {
    expect(modules.map((m) => m.title)).toEqual([
      "Sentence Foundations",
      "Parts of Speech",
      "Nouns & Articles",
      "Adjectives & Adverbs",
      "Word Formation & Word Families",
      "Verb Patterns",
      "Tenses & Verb Forms",
      "Complex Sentences",
    ]);
    expect(modules.filter((m) => m.available)).toHaveLength(1);
    expect(theories).toHaveLength(4);
    expect(foundationQuestions).toHaveLength(64);
    for (const l of theories) {
      expect(l.examples).toHaveLength(3);
      expect(l.mistakes).toHaveLength(3);
      for (const text of [l.what, l.why, l.when, l.exceptions])
        expect(text.length).toBeGreaterThan(100);
    }
  });
  it("links every preserved/new question to real rules and prerequisite lessons", () => {
    expect(bankQuestions).toHaveLength(295);
    for (const q of allQuestions) {
      expect(q.grammar_rule_ids.length).toBeGreaterThan(0);
      for (const rule of [...q.grammar_rule_ids, ...q.prerequisite_lesson_ids])
        expect(lessonById.has(rule)).toBe(true);
    }
    expect(questions.some((q) => q.learning_stage === "mastery")).toBe(false);
  });
  it("fails closed for unlearned or unknown rules without inferring theory from older attempts", async () => {
    await record({
      questionId: "PSWF-001",
      family: "f04",
      type: "Identify Word Class",
      answer: "noun",
      result: "correct",
      date: 0,
    });
    expect(await db.lessons.count()).toBe(0);
    expect(questions.filter((q) => canPractise(q, []))).toEqual([]);
    expect(canPractise({}, [])).toBe(false);
    expect(canStudy(id, [])).toBe(true);
    expect(canStudy("sf-svo-order", [])).toBe(false);
    await theory(id, 1000);
    const rows = await db.lessons.toArray();
    expect(canStudy("sf-svo-order", rows)).toBe(true);
    expect(canStudy("pos-noun", rows)).toBe(false);
    expect(
      questions
        .filter((q) => canPractise(q, rows))
        .every((q) => q.grammar_rule_ids.includes(id)),
    ).toBe(true);
  });
  it("grades punctuation contrasts and boundaries without stripping away the actual error", () => {
    const q = stageQuestions("sf-sentence-boundary", "guided")[1];
    expect(grade(q, q.choices[1])).toBe("incorrect");
    expect(grade(q, q.choices[1].toUpperCase() + "!")).toBe("incorrect");
    const typed = stageQuestions("sf-sentence-boundary", "independent")[0];
    expect(grade(typed, "I work here the office is small.")).toBe("incorrect");
    expect(grade(typed, "I work here. The office is small.")).toBe("correct");
  });
});
describe("complete lesson state machine and check scoring", () => {
  it("starts concurrent lesson views once without duplicate progress rows", async () => {
    const [a, b] = await Promise.all([
      startLesson(id, 1000),
      startLesson(id, 1000),
    ]);
    expect(a).toEqual(b);
    expect(await db.lessons.count()).toBe(1);
  });
  it("never starts an empty future lesson mastery check", async () => {
    await db.lessons.put({
      id: "pos-noun",
      startedAt: 1000,
      completed: [
        "learn",
        "understand",
        "guided",
        "independent",
        "apply",
        "review",
      ],
    });
    await expect(beginMastery("pos-noun", 1000)).rejects.toThrow("activated");
  });
  it("reschedules a missed review and blocks immediate identical repetition", async () => {
    await theory(id, 1000);
    await stage(id, "guided", 1000);
    await stage(id, "independent", 1000);
    await stage(id, "apply", 1000);
    const q = stageQuestions(id, "review")[0];
    await recordLearningAnswer(q.id, q.choices[1], { now: 1000 + day });
    expect((await db.lessons.get(id))?.reviewDueAt).toBe(1000 + 2 * day);
    await expect(
      recordLearningAnswer(q.id, q.answers[0], { now: 1000 + day }),
    ).rejects.toThrow("not due");
  });
  it("does not allow skipping study stages, applications, or due review", async () => {
    await expect(completeTheory(id, "understand", 1000)).rejects.toThrow();
    await expect(
      recordLearningAnswer(
        stageQuestions(id, "independent")[0].id,
        "I work here.",
        { now: 1000 },
      ),
    ).rejects.toThrow();
    await theory(id, 1000);
    await expect(beginMastery(id, 1000)).rejects.toThrow();
    await stage(id, "guided", 1000);
    await stage(id, "independent", 1000);
    await stage(id, "apply", 1000);
    expect(lessonStatus(await db.lessons.get(id))).toBe("Reviewing");
    await expect(stage(id, "review", 1000)).rejects.toThrow();
  });
  it("completes every first-module lesson through theory, practice, apply, next-day review and mixed mastery", async () => {
    let now = 1000;
    for (const [i, lesson] of modules[0].lessons.entries()) {
      await ready(lesson.id, now);
      now += day;
      const check = await beginMastery(lesson.id, now);
      expect(check.questionIds).toHaveLength(6);
      if (i > 0)
        expect(
          new Set(
            check.questionIds.map(
              (qid) => allQuestions.find((q) => q.id === qid)?.lesson_id,
            ),
          ).size,
        ).toBeGreaterThan(1);
      for (const questionId of check.questionIds) {
        const q = allQuestions.find((q) => q.id === questionId)!;
        expect(
          q.grammar_rule_ids.every((rule) =>
            modules[0].lessons.slice(0, i + 1).some((l) => l.id === rule),
          ),
        ).toBe(true);
        await recordLearningAnswer(q.id, q.answers[0], {
          checkId: check.id,
          now,
        });
      }
      const finished = await finishMastery(check.id, now);
      expect(finished.passed).toBe(true);
      expect(lessonStatus(await db.lessons.get(lesson.id))).toBe("Mastered");
      expect((await beginMastery(lesson.id, now)).id).toBe(check.id);
    }
    expect(
      (await db.lessons.toArray()).filter((p) => p.masteredAt),
    ).toHaveLength(4);
    expect(await db.writing.count()).toBe(8);
  });
  it("does not let a revisit overwrite a submitted mastery answer", async () => {
    await ready(id, 1000);
    const check = await beginMastery(id, 1000 + day);
    const q = allQuestions.find((q) => q.id === check.questionIds[0])!;
    await recordLearningAnswer(q.id, q.answers[0], {
      checkId: check.id,
      now: 1000 + day,
    });
    await expect(
      recordLearningAnswer(q.id, q.answers[0], {
        checkId: check.id,
        now: 1000 + day + 1,
      }),
    ).rejects.toThrow("already submitted");
    expect(
      (await db.attempts.toArray()).filter(
        (a) => a.checkId === check.id && a.questionId === q.id,
      ),
    ).toHaveLength(1);
  });
  it("keeps failed/incomplete checks from awarding mastery and requires another due review", async () => {
    await ready(id, 1000);
    const check = await beginMastery(id, 1000 + day);
    await expect(finishMastery(check.id, 1000 + day)).rejects.toThrow();
    for (const [i, qid] of check.questionIds.entries()) {
      const q = allQuestions.find((q) => q.id === qid)!;
      await recordLearningAnswer(
        qid,
        i < 2 ? (q.choices[1] ?? "Incorrect response.") : q.answers[0],
        { checkId: check.id, now: 1000 + day },
      );
    }
    // Resolve any free-text non-matches as needing correction before scoring.
    for (const a of await db.attempts.toArray())
      if (a.checkId === check.id && a.result === "review")
        await verifyLearningAnswer(a.id!, false, 1000 + day);
    const result = await finishMastery(check.id, 1000 + day);
    expect(result.passed).toBe(false);
    expect((await db.lessons.get(id))?.masteredAt).toBeUndefined();
    await expect(beginMastery(id, 1000 + day)).rejects.toThrow();
  });
  it("holds alternative applications for explicit review and permits revisiting mastered theory", async () => {
    await theory(id, 1000);
    await stage(id, "guided", 1000);
    await stage(id, "independent", 1000);
    const [correction, writing] = stageQuestions(id, "apply");
    await recordLearningAnswer(correction.id, correction.answers[0], {
      now: 1000,
    });
    await recordLearningAnswer(writing.id, "Our family works nearby.", {
      now: 1000,
    });
    expect((await db.lessons.get(id))?.completed).not.toContain("apply");
    const a = (await db.attempts.toArray()).find(
      (a) => a.questionId === writing.id,
    )!;
    expect(a.result).toBe("review");
    await verifyLearningAnswer(a.id!, true, 1000);
    expect((await db.lessons.get(id))?.completed).toContain("apply");
  });
});
describe("non-destructive persistence migration", () => {
  it("upgrades a populated version-1 database without rewriting attempts, family reviews, or drafts", async () => {
    await db.delete();
    const old = new Dexie("ielts-grammar-mastery");
    old.version(1).stores({
      attempts: "++id,questionId,family,date,result",
      progress: "id,next",
      writing: "++id,date",
    });
    const attempt = {
      id: 42,
      questionId: "q001",
      family: "f01",
      type: "Identify Word Class",
      answer: "noun",
      result: "correct",
      date: 123,
    };
    await old.table("attempts").add(attempt);
    await old.table("writing").add({
      id: 7,
      text: "Original draft",
      original: "First draft",
      date: 123,
      applied: false,
    });
    await old.table("progress").add({
      id: "f01",
      correct: 1,
      incorrect: 0,
      reviews: 1,
      streak: 1,
      last: 123,
      next: 456,
      mastered: false,
    });
    old.close();
    await db.open();
    expect(await db.attempts.get(42)).toEqual(attempt);
    expect((await db.writing.get(7))?.text).toBe("Original draft");
    expect((await db.progress.get("f01"))?.next).toBe(456);
    expect(await db.lessons.count()).toBe(0);
  });
  it("round-trips v2 backups, accepts v1 backups, and rejects invalid mastery", async () => {
    await theory(id, 1000);
    const backup = await exportBackup();
    await importBackup(backup);
    expect(await exportBackup()).toEqual(backup);
    await importBackup({ version: 1, attempts: [], progress: [], writing: [] });
    expect(await db.lessons.count()).toBe(1);
    const bad = structuredClone(backup);
    bad.lessons[0].completed = [
      "learn",
      "understand",
      "guided",
      "independent",
      "apply",
      "review",
      "mastery",
    ];
    bad.lessons[0].masteredAt = 1000;
    await expect(importBackup(bad)).rejects.toThrow();
    expect(await db.lessons.count()).toBe(1);
  });
});
