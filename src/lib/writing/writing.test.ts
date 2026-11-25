import "fake-indexeddb/auto";
import { beforeEach, expect, it } from "vitest";
import { db, exportBackup, importBackup } from "../db";
import { parseAssessment, patternKey, schedulePattern } from "./model";
import {
  decideIssue,
  mergePatterns,
  saveAssessment,
  saveReview,
} from "./persistence";
import { assessmentFixture, essayFixture, taskFixture } from "./test-support";
import type { ReviewExercise, ReviewGrade } from "./schema";
import { writingGradeSchema } from "../practice/schema";
const now = 1800000000000,
  day = 86400000;
const input = () => ({
  essayId: crypto.randomUUID(),
  task: "task1" as const,
  prompt: taskFixture,
  essay: essayFixture,
});
const assessment = () => parseAssessment(input(), assessmentFixture(), now);
const exercise = (patternId: string, level = 3): ReviewExercise => ({
  id: crypto.randomUUID(),
  patternId,
  level,
  token: "a".repeat(64),
  expiresAt: now + 7 * day,
  promptVi: "Viết câu mới về một tình huống khác.",
  promptEn: "",
  context: crypto.randomUUID(),
  createdAt: now,
});
const grade = (e: ReviewExercise): ReviewGrade => ({
  exerciseId: e.id,
  answer: "I have visited another event.",
  status: "correct",
  confidence: 0.95,
  contextualEvidence: true,
  feedbackVi: "Câu mới đúng và phù hợp ngữ cảnh.",
  correction: "I have visited another event.",
  alternatives: ["I attended another event."],
  referenceAnswers: ["I attended another event."],
});
beforeEach(async () => {
  await db.writingAssessments.clear();
  await db.writingPatterns.clear();
  await db.writingExercises.clear();
  await db.writingOutcomes.clear();
  await db.writingDrafts.clear();
});
it("preserves exact original wording and quarantines fabricated quotations without losing omissions", () => {
  const a = assessment();
  expect(a.originalEssay).toBe(essayFixture);
  expect(a.originalEssay.slice(a.issues[0].start, a.issues[0].end)).toBe(
    "I has attended",
  );
  expect(a.bandEstimate).toBe(6);
  expect(a.omissions).toHaveLength(1);
  const f = assessmentFixture();
  f.issues.push({ ...f.issues[0], original: "invented quote" });
  expect(parseAssessment(input(), f, now).quarantined).toBe(1);
  expect(() =>
    parseAssessment(
      input(),
      { ...f, criteria: { grammar: { band: 10 } } },
      now,
    ),
  ).toThrow();
});
it("isolates style suggestions and accepted original alternatives from genuine errors", async () => {
  const f = assessmentFixture();
  f.issues[0].kind = "style";
  const a = parseAssessment(input(), f, now);
  await saveAssessment(a);
  await expect(decideIssue(a.id, a.issues[0].id, "accepted")).rejects.toThrow();
  expect(await db.writingPatterns.count()).toBe(0);
  f.issues[0].alternatives.push(f.issues[0].original);
  expect(parseAssessment(input(), f, now).issues).toHaveLength(0);
});
it("deduplicates canonical patterns, preserves independent evidence, and does not mutate the essay when editing a correction", async () => {
  const a = assessment(),
    b = assessment();
  await saveAssessment(a);
  await saveAssessment(b);
  await decideIssue(
    a.id,
    a.issues[0].id,
    "accepted",
    { correction: "I have attended" },
    now,
  );
  await decideIssue(b.id, b.issues[0].id, "accepted", undefined, now);
  expect(await db.writingPatterns.count()).toBe(1);
  const p = (await db.writingPatterns.toArray())[0];
  expect(p.evidenceIds).toHaveLength(2);
  expect((await db.writingAssessments.get(a.id))?.originalEssay).toBe(
    essayFixture,
  );
  expect(patternKey("grammar", "third_person_singular_s")).toBe(
    patternKey("grammar", "third_person_singular"),
  );
  await decideIssue(a.id, a.issues[0].id, "accepted");
  expect((await db.writingPatterns.get(p.id))?.evidenceIds).toHaveLength(2);
});
it("requires contextual transfer, independent contexts and two study days before mastery; recurrence reopens mastery", async () => {
  const a = assessment();
  await saveAssessment(a);
  await decideIssue(a.id, a.issues[0].id, "accepted", undefined, now);
  let p = (await db.writingPatterns.toArray())[0];
  for (let i = 0; i < 5; i++) {
    const e = exercise(p.id, 1);
    p = schedulePattern(p, e, grade(e), now);
  }
  expect(p.status).not.toBe("mastered");
  for (let i = 0; i < 3; i++) {
    const e = exercise(p.id, i === 2 ? 4 : 3);
    p = schedulePattern(p, e, grade(e), p.dueAt);
  }
  expect(p.status).toBe("mastered");
  await db.writingPatterns.put(p);
  const b = assessment();
  await saveAssessment(b);
  await decideIssue(b.id, b.issues[0].id, "accepted", undefined, now + 3 * day);
  p = (await db.writingPatterns.get(p.id))!;
  expect(p.status).toBe("learning");
  expect(p.dueAt).toBe(now + 4 * day);
  expect(p.freeWritingPassed).toBe(false);
});
it("does not schedule uncertainty or count repeated submission as new mastery evidence", async () => {
  const a = assessment();
  await saveAssessment(a);
  await decideIssue(a.id, a.issues[0].id, "accepted", undefined, now);
  const p = (await db.writingPatterns.toArray())[0],
    e = exercise(p.id);
  const g = grade(e);
  expect(schedulePattern(p, e, { ...g, status: "needs_review" }, now)).toEqual(
    p,
  );
  expect(
    schedulePattern({ ...p, dueAt: now + day }, e, g, now).successfulContexts,
  ).toHaveLength(0);
  await saveReview(e, g, now);
  await saveReview(e, g, now + day);
  expect(await db.writingOutcomes.count()).toBe(1);
  expect((await db.writingPatterns.get(p.id))?.successfulDays).toHaveLength(1);
  const failed = schedulePattern(
    p,
    e,
    { ...g, status: "incorrect", contextualEvidence: false },
    now,
  );
  expect(failed.dueAt).toBe(now + day);
  expect(failed.lapses).toBe(1);
});
it("merges source evidence conservatively and preserves all review tables in backups and older restores", async () => {
  const a = assessment(),
    b = assessment();
  b.issues[0].ruleId = "other_rule";
  await saveAssessment(a);
  await saveAssessment(b);
  await decideIssue(a.id, a.issues[0].id, "accepted", undefined, now);
  await decideIssue(b.id, b.issues[0].id, "accepted", undefined, now);
  const [p, q] = await db.writingPatterns.toArray();
  await mergePatterns(p.id, q.id, now);
  expect((await db.writingPatterns.get(q.id))?.evidenceIds).toHaveLength(2);
  expect((await db.writingPatterns.get(p.id))?.status).toBe("merged");
  const backup = await exportBackup();
  expect(backup.version).toBe(7);
  await db.writingPatterns.clear();
  await importBackup(backup);
  expect(await db.writingPatterns.count()).toBe(2);
  await importBackup({ ...backup, version: 5, writingPatterns: undefined });
  expect(await db.writingPatterns.count()).toBe(2);
  await expect(
    saveAssessment({ ...a, originalEssay: "altered" }),
  ).rejects.toThrow();
});

it("keeps clean essays compatible with existing Writing results without inventing errors", () => {
  const raw = assessmentFixture(); raw.issues = []; raw.omissions = []; raw.strengthsVi = [];
  const a = parseAssessment(input(), raw, now);
  expect(a.issues).toHaveLength(0);
  expect(writingGradeSchema.safeParse({taskResponse: 7, coherence: 7, vocabulary: 7, grammar: 7, feedbackVi: a.summaryVi, strengthsVi: [], improvementsVi: [], corrections: [], confidence: .9}).success).toBe(true);
});


it("routes recurring merged rules through later merges without recreating source patterns", async () => {
  const essays = [assessment(), assessment(), assessment()];
  essays.forEach((a, i) => { a.issues[0].ruleId = `merge_rule_${i}`; });
  for (const a of essays) {
    await saveAssessment(a);
    await decideIssue(a.id, a.issues[0].id, "accepted", undefined, now);
  }
  const [source, middle, target] = await db.writingPatterns.orderBy("key").toArray();
  await expect(mergePatterns(source.id, source.id, now)).rejects.toThrow();
  expect((await db.writingPatterns.get(source.id))?.status).toBe("learning");
  await mergePatterns(source.id, middle.id, now);
  await mergePatterns(middle.id, target.id, now);
  await db.writingPatterns.update(target.id, {
    status: "mastered", streak: 5, freeWritingPassed: true,
    successfulContexts: ["a", "b", "c"], successfulDays: ["2026-01-01", "2026-01-02"],
  });
  const recurring = assessment();
  recurring.issues[0].ruleId = source.ruleId;
  await saveAssessment(recurring);
  await decideIssue(recurring.id, recurring.issues[0].id, "accepted", undefined, now + day);
  expect(await db.writingPatterns.count()).toBe(3);
  expect((await db.writingPatterns.get(source.id))?.status).toBe("merged");
  const result = (await db.writingPatterns.get(target.id))!;
  expect(result.evidenceIds).toHaveLength(4);
  expect(result.essayIds).toHaveLength(4);
  expect(result.status).toBe("learning");
  expect(result.freeWritingPassed).toBe(false);
  expect(result.dueAt).toBe(now + 2 * day);
  expect((await db.writingAssessments.get(recurring.id))?.issues[0].patternId).toBe(target.id);
});

it("rolls back acceptance when a merged destination is missing or cyclic", async () => {
  const a = assessment();
  await saveAssessment(a);
  await decideIssue(a.id, a.issues[0].id, "accepted", undefined, now);
  const p = (await db.writingPatterns.toArray())[0];
  const b = assessment();
  await saveAssessment(b);
  for (const mergedInto of ["missing-pattern", p.id]) {
    await db.writingPatterns.update(p.id, { status: "merged", mergedInto });
    await expect(decideIssue(b.id, b.issues[0].id, "accepted", undefined, now)).rejects.toThrow();
    expect((await db.writingAssessments.get(b.id))?.issues[0].status).toBe("pending");
    expect((await db.writingPatterns.get(p.id))?.evidenceIds).toEqual([a.issues[0].id]);
  }
});
