import "fake-indexeddb/auto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { guidedLesson, guidedExercises } from "./guided-lesson";
import { knownResult } from "./ai/schema";
import { exerciseById } from "./ai/content";
import {
  gradeGuided,
  readGuidedResults,
  readGuidedDrafts,
  writeGuidedDrafts,
} from "./guided-practice";
import { db } from "./db";
import { validateSettings } from "./ai/dynamic/schema";
beforeEach(async () => {
  await db.aiAttempts.clear();
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());
it("registers 25 unique complete questions with authored explanations and valid keys", () => {
  expect(guidedExercises).toHaveLength(25);
  expect(new Set(guidedExercises.map((q) => q.id)).size).toBe(25);
  for (const q of guidedLesson.questions) {
    expect(q.explanationVi.length).toBeGreaterThan(50);
    expect(q.answers.length).toBeGreaterThan(0);
    expect(exerciseById.get(q.id)).toBeDefined();
    if (q.kind === "choice") {
      expect(new Set(q.choices).size).toBe(q.choices.length);
      expect(q.choices).toContain(q.answers[0]);
    }
  }
  expect(
    guidedExercises.every((q) => q.grammarRules.join(" ").length < 1000),
  ).toBe(true);
});
it("does not certify a model letter as an exact-key answer", () =>
  expect(
    knownResult(guidedExercises[24], guidedLesson.questions[24].answers[0]),
  ).toBeUndefined());
it("saves drafts separately and counts latest attempt once per question", async () => {
  writeGuidedDrafts({ "G01-01": "a draft" });
  expect(readGuidedDrafts()["G01-01"]).toBe("a draft");
  const q = guidedLesson.questions[0];
  await gradeGuided(q.id, q.answers[0]);
  await gradeGuided(q.id, q.answers[0]);
  expect(Object.keys(await readGuidedResults())).toEqual([q.id]);
  expect(await db.aiAttempts.count()).toBe(2);
});
it("sends unseen valid alternatives for semantic grading and retains drafts on API failure", async () => {
  const answer = "An alternative translation.";
  writeGuidedDrafts({ "G01-18": answer });
  const fetcher = vi.fn(async () => new Response("", { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(gradeGuided("G01-18", answer)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledOnce();
  expect(readGuidedDrafts()["G01-18"]).toBe(answer);
  expect(await db.aiAttempts.count()).toBe(0);
});
it("locks extra generation to the reviewed lesson objectives", () => {
  const settings = {
    lessonId: "g01-present-tenses",
    topics: ["verb-tenses"],
    subtopics: { "verb-tenses": "Present simple and continuous" },
    questionCount: 10,
    difficulty: "B1",
    exerciseType: "error_correction",
    feedbackMode: "instant",
  };
  expect(validateSettings(settings).lessonId).toBe(settings.lessonId);
  expect(() =>
    validateSettings({ ...settings, exerciseType: "mixed" }),
  ).toThrow();
});
it('accepts a semantically correct unseen translation returned by the grader',async()=>{
 const answer='My elder sister is staying with me this week.';
 const result={exerciseId:'G01-20',userAnswer:answer,status:'correct',score:1,maxScore:1,correctedAnswer:answer,alternativeAnswers:[],feedbackVi:'Cách diễn đạt đúng và giữ đủ ý.',grammarRule:'Present continuous',explanationVi:'Hành động tạm thời dùng hiện tại tiếp diễn.',errorSpans:[],confidence:.95,needsReview:false};
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({results:[{exerciseId:'G01-20',result}]})));
 expect((await gradeGuided('G01-20',answer)).status).toBe('correct');
});
