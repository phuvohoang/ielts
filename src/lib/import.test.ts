import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import source from "../data/lesson01-import.json";
import {
  adaptImport,
  sourceTypes,
  quarantinedIds,
  extraAnswers,
} from "./importer";
import {
  families,
  bankQuestions as questions,
  importedQuestions,
  legacyQuestions,
  questionById,
  grade,
  canonical,
  sameTokens,
} from "./content";
import { selectSession, questionStates } from "./selection";
import {
  db,
  record,
  resolveAttempt,
  exportBackup,
  importBackup,
  type Attempt,
} from "./db";
const find = (id: string) => questionById.get(id)!;
const attempt = (
  id: string,
  result: Attempt["result"] = "incorrect",
  date = 0,
): Attempt => ({
  questionId: id,
  family: find(id).family,
  type: find(id).type,
  answer: "test",
  result,
  date,
});
const now = 10 * 86400000;
describe("audited, repeatable 300-question import", () => {
  it("keeps all 300 stable source IDs with exact explanations and references", () => {
    expect(source.questions).toHaveLength(300);
    expect(new Set(importedQuestions.map((q) => q.id)).size).toBe(300);
    expect(adaptImport(source, families)).toEqual(
      adaptImport(
        { ...source, questions: [...source.questions].reverse() },
        families,
      ),
    );
    for (const raw of source.questions) {
      const q = find(raw.id);
      expect(q.explanation).toBe(raw.explanation_vi);
      expect(q.explanation.trim()).not.toBe("");
      for (const answer of raw.answer) {
        expect(q.answers).toContain(answer);
        expect(grade(q, answer.toUpperCase() + "!")).toBe("correct");
      }
    }
  });
  it("keeps eight exact source counts and activates only reviewed-safe items", () => {
    expect(
      sourceTypes.map(
        (type) => source.questions.filter((q) => q.type === type).length,
      ),
    ).toEqual([40, 40, 40, 40, 40, 40, 30, 30]);
    expect(questions).toHaveLength(295);
    expect(questions.every((q) => !quarantinedIds.has(q.id))).toBe(true);
    expect(new Set(questions.map((q) => q.type)).size).toBe(8);
    expect(legacyQuestions).toHaveLength(200);
  });
  it("validates choices, highlighted targets, and duplicate token multisets", () => {
    for (const q of importedQuestions) {
      if (q.choices.length)
        for (const a of q.answers) expect(q.choices).toContain(a);
      if (q.tokens) expect(sameTokens(q.tokens, q.answers[0])).toBe(true);
    }
    expect(find("PSWF-201").tokens?.filter((t) => t === "the")).toHaveLength(2);
    expect(
      sameTokens(find("PSWF-201").tokens!, "The tutor explained rule clearly."),
    ).toBe(false);
  });
  it("rejects duplicate IDs and answer/option mismatches instead of appending duplicates", () => {
    const duplicate = structuredClone(source);
    duplicate.questions[1].id = duplicate.questions[0].id;
    expect(() => adaptImport(duplicate, families)).toThrow();
    const wrong = structuredClone(source);
    wrong.questions[0].answer = ["not a choice"];
    expect(() => adaptImport(wrong, families)).toThrow();
  });
  it("accepts all audited alternatives and American spelling without pretending to judge paraphrases", () => {
    for (const [id, answers] of Object.entries(extraAnswers))
      for (const answer of answers)
        expect(grade(find(id), answer)).toBe("correct");
    expect(grade(find("PSWF-100"), " Analyze! ")).toBe("correct");
    expect(grade(find("PSWF-042"), "clear")).toBe("incorrect");
    expect(grade(find("PSWF-067"), "professionality")).toBe("review");
    expect(
      grade(find("PSWF-253"), "We should carefully analyze the results."),
    ).toBe("review");
    for (const type of [
      "Sentence Correction",
      "Sentence Building",
      "Vietnamese to English",
      "Writing Error Recall",
    ])
      expect(
        questions.filter((q) => q.type === type).every((q) => q.requiresReview),
      ).toBe(true);
    expect(
      grade(find("PSWF-201"), "Clearly the tutor explained the rule."),
    ).toBe("review");
    expect(grade(find("PSWF-201"), "The tutor explained rule clearly.")).toBe(
      "incorrect",
    );
    expect(canonical("analysed")).toBe(canonical("analyzed"));
  });
});
describe("unseen-first, balanced, spaced question selection", () => {
  it("mixes all eight types, topics and levels without duplicate IDs", () => {
    const session = selectSession(questions, [], {
      now,
      limit: 100,
      random: () => 0.35,
    });
    expect(new Set(session.slice(0, 8).map((q) => q.type)).size).toBe(8);
    expect(new Set(session.map((q) => q.topic)).size).toBe(10);
    expect(new Set(session.map((q) => q.difficulty))).toEqual(
      new Set(["B1", "B2"]),
    );
    expect(new Set(session.map((q) => q.id)).size).toBe(100);
    for (let i = 1; i < session.length; i++)
      expect(session[i].group).not.toBe(session[i - 1].group);
  });
  it("uses unseen items ahead of completed or failed items and respects cooldowns", () => {
    const pool = questions.slice(0, 3);
    const attempts = [
      attempt(pool[0].id, "incorrect", 0),
      attempt(pool[1].id, "correct", 0),
    ];
    expect(selectSession(pool, attempts, { now, limit: 3 })[0].id).toBe(
      pool[2].id,
    );
    expect(
      selectSession(pool, attempts, { now: 1000, limit: 10 }).map((q) => q.id),
    ).toEqual([pool[2].id]);
    expect(
      selectSession(pool, attempts, { now: 1000, limit: 10, dueOnly: true }),
    ).toEqual([]);
    expect(
      selectSession(pool, attempts, { now, limit: 10, dueOnly: true })
        .map((q) => q.id)
        .sort(),
    ).toEqual(
      pool
        .slice(0, 2)
        .map((q) => q.id)
        .sort(),
    );
  });
  it("cannot repeat within unlimited sessions, handles narrow pools and ignores unresolved answers", () => {
    const q = questions[0];
    expect(
      selectSession([q, q], [attempt(q.id, "review")], { now, limit: 100 }),
    ).toEqual([]);
    expect(
      selectSession([q, q], [], { now, limit: 100, exclude: [q.id] }),
    ).toEqual([]);
    expect(selectSession([q, q], [], { now, limit: 100 })).toHaveLength(1);
  });
  it("advances question intervals and resets mistakes to tomorrow", () => {
    const q = questions[0];
    const h = Array.from({ length: 7 }, (_, i) =>
      attempt(q.id, "correct", i * 1000),
    );
    expect(questionStates(h).get(q.id)?.next).toBe(6000 + 60 * 86400000);
    expect(
      questionStates([...h, attempt(q.id, "incorrect", 7000)]).get(q.id)?.next,
    ).toBe(7000 + 86400000);
  });
});
describe("old and new learner data coexist", () => {
  beforeEach(async () => {
    await db.attempts.clear();
    await db.progress.clear();
    await db.writing.clear();
  });
  it("keeps legacy errors, writing, schedules and backups intact while importing content", async () => {
    await record({
      questionId: "q001",
      family: "f01",
      type: "Identify Word Class",
      answer: "verb",
      result: "incorrect",
      date: 123,
    });
    await db.writing.add({
      text: "Existing draft",
      original: "First draft",
      applied: false,
      date: 123,
    });
    const before = await exportBackup();
    adaptImport(source, families);
    expect(await exportBackup()).toEqual(before);
    expect(questionById.has("q001")).toBe(true);
    await record(attempt("PSWF-041", "correct", 1000));
    expect((await exportBackup()).attempts).toHaveLength(2);
    expect((await db.progress.toArray()).every((p) => p.id !== "")).toBe(true);
    const backup = await exportBackup();
    await importBackup(backup);
    expect(await exportBackup()).toEqual(backup);
  });
  it("starts a resolved review cooldown at review time and persists the resolution", async () => {
    const a = attempt("PSWF-041", "review", 0);
    await record(a);
    const id = (await db.attempts.toArray())[0].id!;
    await resolveAttempt(id, "incorrect");
    const saved = (await db.attempts.toArray())[0];
    expect(saved.reviewedAt).toBeGreaterThan(0);
    expect(questionStates([saved]).get(a.questionId)?.next).toBe(
      saved.reviewedAt! + 86400000,
    );
  });
});
