import inventory from "../../../docs/curriculum/source-inventory.json";
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, expect, it } from "vitest";
import { db, exportBackup, importBackup } from "../db";
import { knowledge, unit, verifiedPatterns } from "./catalog";
import { allChecks, goldQuestions } from "./gold";
import {
  candidateSchema,
  knowledgeSchema,
  sessionSchema,
  curriculumRunSchema,
} from "./schema";
import { deterministicIssues, publicQuestion } from "./quality";
import { saveLessonAnswer, saveLessonGrade } from "./client";
const now = 1800000000000,
  day = 86400000;
const session = () =>
  sessionSchema.parse({
    id: crypto.randomUUID(),
    token: "a".repeat(64),
    unitId: unit.id,
    patternIds: knowledge.map((p) => p.id),
    expiresAt: now + 7 * day,
    questions: goldQuestions().map((q) => publicQuestion(q, allChecks)),
  });
beforeEach(async () => {
  await db.curriculumRuns.clear();
  await db.curriculumProgress.clear();
});
it("validates independently authored records with exact PDF provenance and rejects draft/unknown targets", () => {
  for (const p of knowledge) {
    expect(knowledgeSchema.safeParse(p).success).toBe(true);
    expect(p.sources[0].pdfPages).toEqual([14, 15, 16]);
    expect(p.sources[0].sha256).toHaveLength(64);
    const source = inventory.documents.find(
      (d) => d.sha256 === p.sources[0].sha256,
    )!;
    expect(source).toBeDefined();
    expect(
      p.sources[0].pdfPages.every((page) => page <= source.pageCount),
    ).toBe(true);
  }
  expect(() => verifiedPatterns(["invented"], unit.id)).toThrow();
  expect(() => verifiedPatterns([knowledge[0].id], "wrong-unit")).toThrow();
  expect(() =>
    verifiedPatterns([knowledge[0].id, knowledge[0].id], unit.id),
  ).toThrow();
  expect(
    knowledgeSchema.safeParse({ ...knowledge[0], sources: [] }).success,
  ).toBe(false);
  expect(
    deterministicIssues(goldQuestions()[0], [
      { ...knowledge[0], verification: "draft" },
    ]),
  ).toContain("unverified_target");
});
it("passes ten curated original fixtures and keeps every key/rubric private", () => {
  for (const q of goldQuestions()) {
    expect(candidateSchema.safeParse(q).success).toBe(true);
    expect(deterministicIssues(q, knowledge)).toEqual([]);
    const publicQ = publicQuestion(q, allChecks);
    for (const key of [
      "expectedAnswer",
      "acceptedAlternatives",
      "explanationVi",
      "rubric",
    ])
      expect(publicQ).not.toHaveProperty(key);
  }
});
it("rejects before -> within, copied rewrites, wrong openings, ambiguous option structures and unsupported target formats", () => {
  const q = goldQuestions()[3];
  expect(
    deterministicIssues(
      {
        ...q,
        question: "Journalists verify stories before publication.",
        instructions: "Rewrite beginning with Within while preserving meaning.",
        requiredOpening: "Within",
        expectedAnswer: "Within publication, journalists verify stories.",
      },
      knowledge,
    ),
  ).toContain("before_within_meaning_shift");
  expect(
    deterministicIssues({ ...q, expectedAnswer: q.question }, knowledge),
  ).toContain("no_op");
  expect(
    deterministicIssues(
      { ...q, acceptedAlternatives: ["They sell no papers."] },
      knowledge,
    ),
  ).toContain("opening_mismatch");
  expect(
    deterministicIssues(
      { ...goldQuestions()[0], options: ["opens", "opens"] },
      knowledge,
    ),
  ).toContain("choice_contract");
  expect(
    deterministicIssues({ ...q, format: "word_formation" }, knowledge),
  ).toContain("unsupported_target_format");
});
it("persists drafts and review outcomes idempotently, keeps uncertainty and early practice from advancing intervals", async () => {
  const s = session();
  await db.curriculumRuns.put({
    ...s,
    answers: {},
    results: {},
    updatedAt: now,
  });
  const result = (i: number) => ({
    questionId: s.questions[i].id,
    answer: "A valid alternative.",
    status: "correct" as const,
    confidence: 0.95,
    feedbackVi: "Câu đúng theo nghĩa và ngữ cảnh.",
    demonstratesPattern: true,
    expectedAnswer: goldQuestions()[i].expectedAnswer,
    acceptedAlternatives: [],
    explanationVi: "Dùng cấu trúc hiện tại đúng.",
  });
  await saveLessonAnswer(s.id, s.questions[0].id, "A valid alternative.");
  expect((await db.curriculumRuns.get(s.id))?.answers[s.questions[0].id]).toBe(
    "A valid alternative.",
  );
  await saveLessonGrade(s, result(0), now);
  await saveLessonGrade(s, result(0), now + day);
  expect((await db.curriculumProgress.get("present-simple"))?.streak).toBe(1);
  await saveLessonAnswer(s.id, s.questions[3].id, "A valid alternative.");
  await saveLessonGrade(s, result(3), now + 1000);
  const p = (await db.curriculumProgress.get("present-simple"))!;
  expect(p.streak).toBe(1);
  expect(p.dueAt).toBe(now + day);
  await saveLessonAnswer(s.id, s.questions[1].id, "A valid alternative.");
  await saveLessonGrade(s, { ...result(1), status: "needs_review" }, now);
  expect(await db.curriculumProgress.get("present-continuous")).toBeUndefined();
  await expect(
    saveLessonGrade(s, { ...result(2), answer: "mismatch" }, now),
  ).rejects.toThrow();
  const backup = await exportBackup();
  await db.curriculumRuns.clear();
  await db.curriculumProgress.clear();
  await importBackup(backup);
  expect(await db.curriculumRuns.count()).toBe(1);
  expect(await db.curriculumProgress.count()).toBe(1);
  await importBackup({
    ...backup,
    version: 6,
    curriculumRuns: undefined,
    curriculumProgress: undefined,
  });
  expect(await db.curriculumRuns.count()).toBe(1);
  expect(
    curriculumRunSchema.safeParse(await db.curriculumRuns.get(s.id)).success,
  ).toBe(true);
});

it("upgrades an existing v6 database without losing legacy progress", async () => {
  const stores = Object.fromEntries(
    db.tables
      .filter((t) => !t.name.startsWith("curriculum"))
      .map((t) => [
        t.name,
        [t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)].join(","),
      ]),
  );
  await db.delete();
  const legacy = new Dexie(db.name);
  legacy.version(6).stores(stores);
  await legacy.open();
  await legacy.table("progress").put({
    id: "legacy-family",
    correct: 2,
    incorrect: 1,
    reviews: 3,
    streak: 1,
    last: 10,
    next: 20,
    mastered: false,
  });
  legacy.close();
  await db.open();
  expect(db.verno).toBe(7);
  expect((await db.progress.get("legacy-family"))?.correct).toBe(2);
  expect(await db.curriculumRuns.count()).toBe(0);
});
