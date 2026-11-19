import { expect, it } from "vitest";
import "fake-indexeddb/auto";
import {
  makePlan,
  validateSettings,
  localSessionSchema,
  publicQuestion,
  type Settings,
  type PracticeSession,
} from "./schema";
import { topics, difficultyGuidelines, formats } from "./topics";
import {
  draftIssues,
  prepareOrdering,
} from "../../../../worker/question-format";
import { questionFixture } from "./test-support";
import { practiceReport, retryQuestionIds } from "./results";
import { db, exportBackup, importBackup } from "../../db";
import { type GradeResult } from "../schema";
const defaults: Settings = {
  topics: ["all"],
  ieltsTopic: "all",
  difficulty: "B2",
  questionCount: 20,
  exerciseType: "mixed",
  feedbackMode: "instant",
};
it.each([10, 20, 50] as const)(
  "plans exactly %i questions, balances chosen skills and IELTS contexts, and mixes suitable formats",
  (count) => {
    const plan = makePlan({ ...defaults, questionCount: count });
    expect(plan).toHaveLength(count);
    expect(
      new Set(plan.map((q) => q.exerciseType)).size,
    ).toBeGreaterThanOrEqual(4);
    expect(new Set(plan.map((q) => q.ieltsTopic)).size).toBeGreaterThanOrEqual(
      10,
    );
    expect(
      plan.every((q) =>
        topics
          .find((t) => t.topicId === q.topicId)!
          .supportedExerciseTypes.includes(q.exerciseType),
      ),
    ).toBe(true);
    const selected = makePlan({
      ...defaults,
      questionCount: count,
      topics: ["verb-tenses", "conditionals"],
      ieltsTopic: "education",
    });
    expect(new Set(selected.map((q) => q.topicId))).toEqual(
      new Set(["verb-tenses", "conditionals"]),
    );
    expect(selected.every((q) => q.ieltsTopic === "education")).toBe(true);
    expect(
      Math.abs(
        selected.filter((q) => q.topicId === "verb-tenses").length -
          selected.filter((q) => q.topicId === "conditionals").length,
      ),
    ).toBeLessThanOrEqual(1);
  },
);
it("keeps word formation focused, validates subtopics and rejects unsupported categories/context", () => {
  expect(
    makePlan({ ...defaults, topics: ["word-formation"] }).every(
      (q) => q.topicId === "word-formation",
    ),
  ).toBe(true);
  const plan = makePlan({
    ...defaults,
    topics: ["verb-tenses"],
    subtopics: { "verb-tenses": "Past simple and continuous" },
  });
  expect(
    plan.every((q) => q.grammarSubtopic === "Past simple and continuous"),
  ).toBe(true);
  for (const config of [
    { topics: ["all", "conditionals"] },
    { ieltsTopic: "invented" },
    { topics: ["not-a-rule"] },
    { subtopics: { "verb-tenses": "invented" } },
  ])
    expect(() => validateSettings({ ...defaults, ...config })).toThrow();
  expect(difficultyGuidelines.A2).toContain("One short clause");
  expect(difficultyGuidelines.C1).toContain("Nuanced aspect");
  expect(formats).toContain("meaning_comparison");
});
it("rejects malformed choices and keeps reference keys private", () => {
  const q = questionFixture(crypto.randomUUID(), {
    topicId: "verb-tenses",
    exerciseType: "multiple_choice",
    ordinal: 0,
  });
  expect(draftIssues(q)).toEqual([]);
  q.options[1].id = "a";
  expect(draftIssues(q).length).toBeGreaterThan(0);
  expect(publicQuestion(q)).not.toHaveProperty("referenceAnswers");
  expect(publicQuestion(q)).not.toHaveProperty("gradingCriteria");
});
it("shuffles reordering tokens without revealing the reference order or losing repeated words", () => {
  const q = questionFixture(crypto.randomUUID(), {
    topicId: "sentence-structure",
    exerciseType: "sentence_reordering",
    ordinal: 0,
  });
  q.referenceAnswers = ["The students had finished the work."];
  const prepared = prepareOrdering(q);
  expect(prepared.reorderTokens!.slice().sort()).toEqual(
    q.referenceAnswers[0].split(" ").sort(),
  );
  expect(prepared.reorderTokens!.join(" ")).not.toBe(q.referenceAnswers[0]);
  expect(publicQuestion(prepared)).not.toHaveProperty("referenceAnswers");
});
function session(): PracticeSession {
  const id = crypto.randomUUID();
  return localSessionSchema.parse({
    sessionId: id,
    accessToken: "a".repeat(64),
    expiresAt: Date.now() + 100000,
    settings: { ...defaults, questionCount: 10 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    questions: makePlan({
      ...defaults,
      questionCount: 10,
      topics: ["verb-tenses", "conditionals"],
    }).map((item) => publicQuestion(questionFixture(id, item))),
    nextBatch: 1,
    generationComplete: true,
    answers: {},
    results: {},
    reveals: {},
    currentIndex: 0,
    status: "practicing",
    examSubmitted: false,
  });
}
function result(id: string, status: GradeResult["status"]): GradeResult {
  return {
    exerciseId: id,
    userAnswer: "answer",
    status,
    score:
      status === "correct"
        ? 1
        : status === "incorrect"
          ? 0
          : status === "partially_correct"
            ? 0.5
            : null,
    maxScore: 1,
    correctedAnswer: "correction",
    alternativeAnswers: [],
    feedbackVi: "Giải thích cụ thể theo câu trả lời.",
    grammarRule: "A context-specific rule",
    explanationVi: "Ngữ cảnh quyết định cách dùng cấu trúc.",
    errorSpans: [],
    confidence: 0.95,
    needsReview: status === "needs_review",
  };
}
it("reports weighted scores by category/format and retries only incorrect or unanswered items", () => {
  const s = session();
  for (let i = 0; i < 5; i++) s.answers[s.questions[i].id] = "draft";
  ["correct", "incorrect", "partially_correct", "needs_review"].forEach(
    (status, i) =>
      (s.results[s.questions[i].id] = result(
        s.questions[i].id,
        status as GradeResult["status"],
      )),
  );
  const r = practiceReport(s);
  expect(r.percentage).toBe(50);
  expect(r.unanswered).toBe(5);
  expect(r.ungraded).toBe(1);
  expect(r.pending).toBe(1);
  expect(r.categories).toHaveLength(2);
  expect(r.formats.length).toBeGreaterThanOrEqual(4);
  expect(retryQuestionIds(s)).toEqual([
    s.questions[1].id,
    ...s.questions.slice(5).map((q) => q.id),
  ]);
});
it("preserves retake state and prior-round results through backup restoration", async () => {
  const s = session();
  s.answers[s.questions[0].id] = "saved draft";
  s.results[s.questions[0].id] = result(s.questions[0].id, "incorrect");
  s.previousRounds = [
    {
      date: Date.now(),
      answers: { ...s.answers },
      results: { ...s.results },
      reveals: {},
    },
  ];
  s.retryIds = [s.questions[0].id];
  await db.practiceSessions.put(s);
  const backup = await exportBackup();
  await db.practiceSessions.delete(s.sessionId);
  await importBackup(backup);
  const restored = await db.practiceSessions.get(s.sessionId);
  expect(restored?.previousRounds?.[0].results[s.questions[0].id].status).toBe(
    "incorrect",
  );
  expect(restored?.retryIds).toEqual(s.retryIds);
  expect(restored?.answers[s.questions[0].id]).toBe("saved draft");
});

it("keeps elementary subtopics out of advanced grammar and prevents advanced structures in A2 plans", () => {
  const beginner = makePlan({
    ...defaults,
    difficulty: "A2",
    questionCount: 50,
  });
  expect(
    beginner.some((q) =>
      ["inversion", "participle-clauses", "nominalisation"].includes(q.topicId),
    ),
  ).toBe(false);
  const conditionals = makePlan({
    ...defaults,
    difficulty: "A2",
    topics: ["conditionals"],
    questionCount: 20,
  });
  expect(new Set(conditionals.map((q) => q.grammarSubtopic))).toEqual(
    new Set(["Zero and first"]),
  );
  expect(() =>
    validateSettings({
      ...defaults,
      difficulty: "A2",
      topics: ["conditionals"],
      subtopics: { conditionals: "Mixed conditionals" },
    }),
  ).toThrow();
  const advanced = makePlan({
    ...defaults,
    difficulty: "C1",
    topics: ["verb-tenses", "conditionals"],
  });
  expect(advanced[0].grammarSubtopic).toBe("Perfect continuous");
  expect(advanced[1].grammarSubtopic).toBe("Mixed conditionals");
});

it("rejects an answer supplied as the word-family root and incomplete underline instructions during authoring", () => {
  const q = questionFixture(crypto.randomUUID(), {
    topicId: "word-formation",
    exerciseType: "word_formation",
    ordinal: 0,
  });
  q.rootWord = q.referenceAnswers[0];
  expect(draftIssues(q).join(" ")).toContain("root already gives");
  q.rootWord = "care";
  q.instruction = "Use the underlined part.";
  q.underlinedText = null;
  expect(draftIssues(q).join(" ")).toContain("exact unique source substring");
});

it("keeps meaning-comparison semantics distinct from a cloze task for the AI grader", async () => {
  const { asExercise } = await import("../../../../worker/sessions");
  const q = questionFixture(crypto.randomUUID(), {
    topicId: "passive-voice",
    exerciseType: "meaning_comparison",
    ordinal: 0,
  });
  expect(asExercise(q).type).toBe("meaning_comparison");
  expect(asExercise(q).rubric).toContain("selected interpretation");
});

it("does not publish conditional error-correction keys that assume if plus will is inherently wrong", () => {
  const q = questionFixture(crypto.randomUUID(), {
    topicId: "conditionals",
    exerciseType: "error_correction",
    ordinal: 0,
  });
  q.questionText = "If students will study hard every day, they pass the exam.";
  q.referenceAnswers = [
    "If students study hard every day, they pass the exam.",
  ];
  expect(draftIssues(q).join(" ")).toContain("willingness");
  q.questionText = "If students study hard, they will to pass the exam.";
  q.referenceAnswers = ["If students study hard, they will pass the exam."];
  expect(draftIssues(q)).toEqual([]);
});
