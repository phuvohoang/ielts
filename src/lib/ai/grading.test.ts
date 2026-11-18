import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import "fake-indexeddb/auto";
import worker, { infer, withTimeout, boundedMap } from "../../../worker/index";
import { b2Exercises } from "./content";
import { knownResult, resultSchema, summary, type GradeResult } from "./schema";
import { gradeExercise } from "./client";
import { db, exportBackup, importBackup } from "../db";
const report = (
  id: string,
  answer: string,
  status: GradeResult["status"] = "correct",
): GradeResult => ({
  exerciseId: id,
  userAnswer: answer,
  status,
  score:
    status === "correct"
      ? 1
      : status === "partially_correct"
        ? 0.5
        : status === "incorrect"
          ? 0
          : null,
  maxScore: 1,
  correctedAnswer: "A correction.",
  alternativeAnswers: [],
  feedbackVi: "Đánh giá theo ngữ cảnh.",
  grammarRule: "Verb Pattern",
  explanationVi: "Giữ đúng ý nghĩa, thời và cấu trúc theo yêu cầu.",
  errorSpans: [],
  confidence: 0.9,
  needsReview: status === "needs_review",
});
const env = () => ({
  AI: { run: vi.fn() },
  AI_MODEL: "configured-test-model",
  ALLOWED_ORIGINS: "http://localhost:5173",
  GRADE_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
  GLOBAL_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
});
const request = (submissions: unknown) =>
  new Request("https://ielts.test/api/grammar/grade", {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ submissions }),
  });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
beforeEach(async () => {
  await db.aiAttempts.clear();
});
describe("B2 content and accepted references", () => {
  it("has 25 unique reviewed questions in parts 8/7/10 with explanations and semantic rubrics", () => {
    expect(b2Exercises).toHaveLength(25);
    expect(new Set(b2Exercises.map((q) => q.id)).size).toBe(25);
    expect(
      ["A", "B", "C"].map(
        (p) => b2Exercises.filter((q) => q.part === p).length,
      ),
    ).toEqual([8, 7, 10]);
    for (const q of b2Exercises) {
      expect(q.explanation.length).toBeGreaterThan(50);
      for (const answer of [...q.referenceAnswers, ...q.acceptedVariants])
        expect(knownResult(q, answer)?.score).toBe(1);
    }
  });
  it.each([
    [16, "The company grew significantly."],
    [18, "The government decided rapidly."],
    [18, "The government decided quickly."],
    [19, "The project was a success."],
    [21, "The teacher explained it accurately."],
    [22, "The company's response to the crisis was effective."],
    [23, "The researchers were surprised by the results."],
    [25, "The manager appeared very confident during the interview."],
  ])("accepts verified regression answer %s: %s", (n, answer) => {
    expect(knownResult(b2Exercises[n - 1], answer)?.status).toBe("correct");
  });
  it("does not infer equivalence from similar strings or ambiguous root words", () => {
    expect(
      knownResult(b2Exercises[16], "She explained it clearly."),
    ).toBeUndefined();
    expect(
      knownResult(b2Exercises[19], "Her English has improved considerably."),
    ).toBeUndefined();
    expect(
      knownResult(
        b2Exercises[23],
        "The beginners found the instructions are confusing.",
      ),
    ).toBeUndefined();
    expect(
      knownResult(b2Exercises[24], "The manager demonstrated confidence."),
    ).toBeUndefined();
    expect(knownResult(b2Exercises[5], "historic")).toBeUndefined();
  });
});
it("passes the full source, intensity/tense constraints, and untrusted answer to AI; retains partial credit", async () => {
  for (const [index, answer] of [
    [16, "She explained it clearly."],
    [19, "Her English has improved considerably."],
  ] as const) {
    const e = env(),
      q = b2Exercises[index];
    e.AI.run.mockResolvedValue({
      response: JSON.stringify(report(q.id, answer, "partially_correct")),
    });
    const result = await infer(e, q, answer);
    expect(result.score).toBe(0.5);
    const call = e.AI.run.mock.calls[0] as unknown as [
      string,
      { messages: { content: string }[] },
    ];
    expect(call[0]).toBe(e.AI_MODEL);
    const data = JSON.parse(call[1].messages[1].content);
    expect(data.exercise.rubric).toBe(q.rubric);
    expect(data.exercise.question).toBe(q.question);
    expect(data.userAnswer).toBe(answer);
  }
});
it("validates incorrect Object Complement model feedback without turning provider failures into incorrect", async () => {
  const e = env(),
    q = b2Exercises[23],
    answer = "The beginners found the instructions are confusing.";
  e.AI.run.mockResolvedValue({ response: report(q.id, answer, "incorrect") });
  expect((await infer(e, q, answer)).status).toBe("incorrect");
  e.AI.run.mockResolvedValue({ response: "broken JSON" });
  await expect(infer(e, q, answer)).rejects.toThrow("AI unavailable");
  expect(e.AI.run).toHaveBeenCalledTimes(3);
});
it("keeps low confidence unscored and omits unverified error spans", async () => {
  const q = b2Exercises[0],
    e = env();
  e.AI.run.mockResolvedValue({
    response: { ...report(q.id, "wrong"), confidence: 0.1 },
  });
  expect(await infer(e, q, "wrong")).toMatchObject({
    status: "needs_review",
    score: null,
    needsReview: true,
  });
  expect(
    resultSchema.safeParse({
      ...report(q.id, "wrong", "needs_review"),
      score: 0,
    }).success,
  ).toBe(false);
  e.AI.run.mockResolvedValue({
    response: {
      ...report(q.id, "wrong"),
      errorSpans: [{ text: "absent", type: "grammar", suggestion: "good" }],
    },
  });
  expect((await infer(e, q, "wrong")).errorSpans).toEqual([]);
});
it("enforces timeouts without scoring a hanging provider call", async () => {
  vi.useFakeTimers();
  const promise = withTimeout(() => new Promise(() => {}), 20);
  const assertion = expect(promise).rejects.toThrow("timeout");
  await vi.advanceTimersByTimeAsync(21);
  await assertion;
});
it("keeps batch partial failures per question and restricts CORS, body size, unknown IDs and rate", async () => {
  const e = env();
  e.AI.run.mockRejectedValue(Error("provider down"));
  const res = await worker.fetch(
    request([
      { exerciseId: b2Exercises[0].id, version: 1, userAnswer: "economic" },
      {
        exerciseId: b2Exercises[1].id,
        version: 1,
        userAnswer: "a novel answer",
      },
    ]),
    e,
  );
  const body = (await res.json()) as {
    results: { result?: GradeResult; error?: string }[];
  };
  expect(body.results[0].result?.score).toBe(1);
  expect(body.results[1].result).toBeUndefined();
  expect(body.results[1].error).toBeTruthy();
  expect(body.results[1]).toMatchObject({
    errorCode: "AI_PROVIDER_ERROR",
    reason: "provider",
  });
  expect(
    (
      await worker.fetch(
        new Request("https://ielts.test/api/grammar/grade", { method: "POST" }),
        e,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await worker.fetch(
        request([{ exerciseId: "unknown", version: 1, userAnswer: "text" }]),
        e,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await worker.fetch(
        request([
          {
            exerciseId: b2Exercises[0].id,
            version: 1,
            userAnswer: "x".repeat(33000),
          },
        ]),
        e,
      )
    ).status,
  ).toBe(413);
  e.GRADE_LIMIT.limit.mockResolvedValue({ success: false });
  expect(
    (
      await worker.fetch(
        request([
          { exerciseId: b2Exercises[0].id, version: 1, userAnswer: "text" },
        ]),
        e,
      )
    ).status,
  ).toBe(429);
});
it("bounds concurrent batch work", async () => {
  let active = 0,
    max = 0;
  await boundedMap([1, 2, 3, 4], async () => {
    active++;
    max = Math.max(max, active);
    await Promise.resolve();
    active--;
  });
  expect(max).toBe(2);
});
it("deduplicates concurrent client submissions and leaves network failure unscored", async () => {
  vi.stubEnv("VITE_GRAMMAR_API_URL", "https://ielts.test/api/grammar/grade");
  const q = b2Exercises[1],
    answer = "unlisted alternative";
  const fetcher = vi.fn(async () =>
    Response.json({
      results: [{ exerciseId: q.id, result: report(q.id, answer) }],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  await Promise.all([gradeExercise(q, answer), gradeExercise(q, answer)]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockRejectedValue(Error("offline"));
  await expect(gradeExercise(q, "different answer")).rejects.toThrow("offline");
});
it("computes score with pending excluded, keeps retries and includes attempts in v3 backups", async () => {
  const results = [
    report("one", "one"),
    report("two", "two", "partially_correct"),
    report("three", "three", "incorrect"),
    report("four", "four", "needs_review"),
  ];
  expect(summary(results)).toEqual({
    score: 1.5,
    maxScore: 3,
    correct: 1,
    partial: 1,
    incorrect: 1,
    pending: 1,
  });
  await db.aiAttempts.bulkAdd(
    results.map((result, i) => ({
      id: `attempt-${i}`,
      sessionId: "session",
      exerciseId: "same-exercise",
      version: 1,
      userAnswer: result.userAnswer,
      date: i,
      result,
    })),
  );
  const backup = await exportBackup();
  expect(backup.version).toBe(3);
  expect(backup.aiAttempts).toHaveLength(4);
  await importBackup(backup);
  expect(await db.aiAttempts.count()).toBe(4);
  await importBackup({ version: 1, attempts: [], progress: [], writing: [] });
  expect(await db.aiAttempts.count()).toBe(4);
});

it("deduplicates unknown answers in a batch and accepts an AI-verified unseen alternative", async () => {
  const q = b2Exercises[17],
    answer = "The government quickly decided.";
  const e = env();
  e.AI.run.mockResolvedValue({ response: report(q.id, answer) });
  const body = (await (
    await worker.fetch(
      request([
        { exerciseId: q.id, version: 1, userAnswer: answer },
        { exerciseId: q.id, version: 1, userAnswer: answer },
      ]),
      e,
    )
  ).json()) as { results: { result: GradeResult }[] };
  expect(e.AI.run).toHaveBeenCalledTimes(1);
  expect(body.results.map((r) => r.result.status)).toEqual([
    "correct",
    "correct",
  ]);
});

it("retains numeric provider diagnostics without exposing provider messages or answers", async () => {
  const e = env(),
    q = b2Exercises[0];
  e.AI.run.mockRejectedValue(
    Object.assign(Error("private provider details and student answer"), {
      code: 3040,
    }),
  );
  await expect(infer(e, q, "unlisted input")).rejects.toMatchObject({
    message: "AI unavailable",
    code: "AI_PROVIDER_ERROR",
    reason: "provider:3040",
  });
});

it("builds scores and original-answer identity from the request and validated semantic verdict", async () => {
  const e = env(),
    q = b2Exercises[16],
    answer = "She explained it clearly.";
  e.AI.run.mockResolvedValue({
    response: {
      ...report("invented-id", "invented echo", "partially_correct"),
      score: 99,
      maxScore: 100,
      needsReview: true,
    },
  });
  const result = await infer(e, q, answer);
  expect(result).toMatchObject({
    exerciseId: q.id,
    userAnswer: answer,
    status: "partially_correct",
    score: 0.5,
    maxScore: 1,
    needsReview: false,
  });
  const input = e.AI.run.mock.calls[0] as unknown as [
    string,
    {
      response_format: { json_schema: { properties: Record<string, unknown> } };
    },
  ];
  expect(
    Object.keys(input[1].response_format.json_schema.properties),
  ).not.toContain("userAnswer");
});
