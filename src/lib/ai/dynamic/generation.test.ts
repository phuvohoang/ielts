import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import "fake-indexeddb/auto";
import worker from "../../../../worker/index";
import {
  generateBatch,
  callStructured,
  providerProblem,
} from "../../../../worker/generation";
import {
  GrammarSessions,
  gradeGenerated,
  type SessionEnv,
} from "../../../../worker/sessions";
import { topics, difficultyGuidelines } from "./topics";
import {
  validateSettings,
  makePlan,
  publicQuestion,
  privateQuestionSchema,
  generationResponseSchema,
  type Settings,
  type PlanItem,
  type PracticeSession,
  type PrivateQuestion,
} from "./schema";
import {
  qualityIssues,
  similar,
  shuffleOptions,
  normalizeQuestionAnswers,
} from "./quality";
import { contentFixture, questionFixture, auditFixture } from "./test-support";
import { db, exportBackup, importBackup } from "../../db";
import { saveSession, saveGraded } from "./persistence";
import { summary } from "../schema";
const settings: Settings = {
  topics: ["word-formation"],
  questionCount: 10,
  difficulty: "B2",
  exerciseType: "mixed",
  feedbackMode: "instant",
};
class MemoryStorage {
  data = new Map<string, unknown>();
  alarm = 0;
  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.data.get(key)) as T | undefined;
  }
  async put(key: string, value: unknown) {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 128 * 1024)
      throw Error("Durable Object value too large");
    this.data.set(key, structuredClone(value));
  }
  async setAlarm(time: number) {
    this.alarm = time;
  }
  async deleteAll() {
    this.data.clear();
  }
}
function environment() {
  const AI = {
    run: vi.fn(async (_model: string, input: unknown) => {
      const messages = (input as { messages: { content: string }[] }).messages;
      const data = JSON.parse(messages[1].content);
      if (messages[0].content.startsWith("Create ORIGINAL"))
        return {
          response: {
            questions: (data.plan as PlanItem[]).map((item) =>
              contentFixture(item),
            ),
          },
        };
      if (messages[0].content.startsWith("Independently audit"))
        return { response: auditFixture(data.questions) };
      throw Error("Unexpected grading AI");
    }),
  };
  const env: SessionEnv = {
    AI,
    AI_MODEL: "test",
    ALLOWED_ORIGINS: "https://test.example",
    GRADE_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
    GLOBAL_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
    GENERATE_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
  };
  const objects = new Map<string, GrammarSessions>(),
    stores = new Map<string, MemoryStorage>();
  env.SESSIONS = {
    idFromName: (name) => name,
    get: (id) => {
      const name = String(id);
      if (!objects.has(name)) {
        const storage = new MemoryStorage();
        stores.set(name, storage);
        objects.set(name, new GrammarSessions({ storage }, env));
      }
      return objects.get(name)!;
    },
  };
  return { env, AI, objects, stores };
}
const req = (path: string, body: unknown, origin = "https://test.example") =>
  new Request("https://worker.test/api/grammar/" + path, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
async function create(env: SessionEnv, override: Partial<Settings> = {}) {
  const response = await worker.fetch(
    req("generate", {
      ...settings,
      ...override,
      recentQuestions: [],
      failedSkills: [],
    }),
    env,
  );
  expect(response.status).toBe(200);
  return generationResponseSchema.parse(await response.json());
}
async function batch(
  env: SessionEnv,
  s: { sessionId: string; accessToken: string },
  index: number,
) {
  return worker.fetch(
    req("generate", {
      sessionId: s.sessionId,
      accessToken: s.accessToken,
      batchIndex: index,
    }),
    env,
  );
}

it("creates all 20 questions without a pre-publication AI audit and keeps keys private", async () => {
  const { env, AI } = environment();
  const session = await create(env, { questionCount: 20 });
  const first = generationResponseSchema.parse(
    await (await batch(env, session, 0)).json(),
  );
  const second = generationResponseSchema.parse(
    await (await batch(env, session, 1)).json(),
  );
  expect(first.questions).toHaveLength(10);
  expect(second.questions).toHaveLength(10);
  expect(second.complete).toBe(true);
  expect(
    new Set([...first.questions, ...second.questions].map((q) => q.id)).size,
  ).toBe(20);
  expect(AI.run).toHaveBeenCalledTimes(20);
  expect(
    AI.run.mock.calls.every((call) =>
      JSON.stringify(call).includes("Create ORIGINAL"),
    ),
  ).toBe(true);
  expect(JSON.stringify([first, second])).not.toMatch(
    /referenceAnswers|correctOptionId|explanationVi/,
  );
});

it("keeps the legacy full-batch contract while preserving accepted rows for retry", async () => {
  const { env, AI, stores } = environment();
  const standard = AI.run.getMockImplementation()!;
  AI.run.mockImplementation(async (model, input) => {
    const messages = (input as { messages: { content: string }[] }).messages;
    const data = JSON.parse(messages[1].content);
    if (
      messages[0].content.startsWith("Create ORIGINAL") &&
      data.plan[0].ordinal === 3
    )
      throw Error("temporary failure");
    return standard(model, input);
  });
  const s = await create(env);
  expect((await batch(env, s, 0)).status).toBe(503);
  const before = (await stores
    .get(s.sessionId)!
    .get<PrivateQuestion[]>("batch:0"))!;
  expect(before).toHaveLength(9);
  AI.run.mockImplementation(standard);
  AI.run.mockClear();
  const repaired = generationResponseSchema.parse(
    await (await batch(env, s, 0)).json(),
  );
  expect(repaired.questions.filter((q) => q.ordinal !== 3)).toEqual(
    before.map(publicQuestion),
  );
  expect(AI.run).toHaveBeenCalledTimes(1);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
beforeEach(async () => {
  await db.practiceSessions.clear();
  await db.aiAttempts.clear();
});
describe("topic registry and balanced planning", () => {
  it("rejects disabled/unknown topics, duplicates, unsupported formats and invalid counts", () => {
    expect(() =>
      validateSettings({
        ...settings,
        topics: ["verb-tenses"],
        exerciseType: "word_formation",
      }),
    ).toThrow();
    expect(() =>
      validateSettings({ ...settings, topics: ["unknown"] }),
    ).toThrow();
    expect(() =>
      validateSettings({
        ...settings,
        topics: ["word-formation", "word-formation"],
      }),
    ).toThrow();
    expect(() =>
      validateSettings({ ...settings, questionCount: 25 }),
    ).toThrow();
    expect(() =>
      validateSettings({ ...settings, exerciseType: "invented" }),
    ).toThrow();
    expect(topics.filter((t) => t.enabled)).toHaveLength(20);
    expect(topics.every((t) => t.generationGuidelines && t.gradingRubric)).toBe(
      true,
    );
  });
  it("distributes multiple enabled topics and their formats evenly using the same registry engine", () => {
    const registry = [
      topics[0],
      { ...topics[0], topicId: "future-enabled-test", enabled: true },
    ];
    const plan = makePlan(
      {
        ...settings,
        questionCount: 50,
        topics: registry.map((t) => t.topicId),
      },
      registry,
    );
    expect(plan.filter((p) => p.topicId === "word-formation")).toHaveLength(25);
    expect(
      plan.filter((p) => p.topicId === "future-enabled-test"),
    ).toHaveLength(25);
    for (const topic of registry) {
      const counts = topic.supportedExerciseTypes.map(
        (f) =>
          plan.filter(
            (p) => p.topicId === topic.topicId && p.exerciseType === f,
          ).length,
      );
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });
  it.each(["A1", "A2", "B1", "B2", "C1"] as const)(
    "passes %s vocabulary and complexity guidance to the AI",
    async (difficulty) => {
      const { env, AI } = environment();
      await generateBatch(
        env,
        { ...settings, difficulty },
        crypto.randomUUID(),
        makePlan(settings),
        [],
        ["Adverb placement"],
      );
      expect(JSON.stringify(AI.run.mock.calls[0])).toContain(
        difficultyGuidelines[difficulty],
      );
      expect(JSON.stringify(AI.run.mock.calls[0])).toContain(
        "Adverb placement",
      );
    },
  );
});
describe("generation and durable batches", () => {
  it.each([10, 20, 50] as const)(
    "creates %i questions in stable batches with no keys in public JSON",
    async (questionCount) => {
      const { env, AI, stores, objects } = environment(),
        s = await create(env, { questionCount });
      const ids: string[] = [];
      for (let i = 0; i < questionCount / 10; i++) {
        const response = await batch(env, s, i);
        expect(response.status).toBe(200);
        const body = generationResponseSchema.parse(await response.json());
        expect(body.nextBatch).toBe(i + 1);
        expect(body.complete).toBe(i === questionCount / 10 - 1);
        expect(body.questions.map((q) => q.ordinal)).toEqual(
          Array.from({ length: 10 }, (_, j) => i * 10 + j),
        );
        expect(body.questions.every((q) => q.sessionId === s.sessionId)).toBe(
          true,
        );
        expect(JSON.stringify(body)).not.toMatch(
          /referenceAnswers|correctOptionId|explanationVi|distractorExplanations/,
        );
        ids.push(...body.questions.map((q) => q.id));
      }
      expect(new Set(ids).size).toBe(questionCount);
      expect(AI.run).toHaveBeenCalledTimes(questionCount);
      // Object restart and a repeated batch reuse persisted keys and IDs without AI calls.
      objects.set(
        s.sessionId,
        new GrammarSessions({ storage: stores.get(s.sessionId)! }, env),
      );
      const replay = await (await batch(env, s, 0)).json();
      expect(replay.questions.map((q: { id: string }) => q.id)).toEqual(
        ids.slice(0, 10),
      );
      expect(AI.run).toHaveBeenCalledTimes(questionCount);
    },
  );
  it("deduplicates simultaneous requests for the same batch", async () => {
    const { env, AI } = environment(),
      s = await create(env);
    const responses = await Promise.all([batch(env, s, 0), batch(env, s, 0)]);
    const bodies = await Promise.all(responses.map((r) => r.json()));
    expect(bodies[0].questions).toEqual(bodies[1].questions);
    expect(AI.run).toHaveBeenCalledTimes(10);
  });
  it("preserves an earlier batch when the next batch fails, and retries without changing prior questions", async () => {
    const { env, AI } = environment(),
      s = await create(env, { questionCount: 20 });
    const first = await (await batch(env, s, 0)).json();
    const standard = AI.run.getMockImplementation()!;
    AI.run.mockRejectedValue(Error("quota"));
    expect((await batch(env, s, 1)).status).toBe(503);
    AI.run.mockImplementation(standard);
    const retry = await (await batch(env, s, 1)).json();
    expect(retry.questions[0].ordinal).toBe(10);
    expect((await (await batch(env, s, 0)).json()).questions).toEqual(
      first.questions,
    );
  });
  it("does not publish invalid JSON and uses bounded retries", async () => {
    const { env, AI } = environment(),
      s = await create(env);
    const standard = AI.run.getMockImplementation()!;
    AI.run.mockResolvedValue({ response: "{invalid" } as never);
    expect((await batch(env, s, 0)).status).toBe(503);
    expect(AI.run).toHaveBeenCalledTimes(30);
    AI.run.mockImplementation(standard);
    const parsed = await (await batch(env, s, 0)).json();
    expect(parsed.questions).toHaveLength(10);
  });
  it("does not ask an independent auditor to approve authored content", async () => {
    const { env, AI } = environment();
    const questions = await generateBatch(
      env,
      settings,
      crypto.randomUUID(),
      makePlan(settings),
      [],
      [],
    );
    expect(questions).toHaveLength(10);
    expect(AI.run).toHaveBeenCalledTimes(10);
    expect(JSON.stringify(AI.run.mock.calls)).not.toContain(
      "Independently audit",
    );
  });
  it("times out an unresponsive model without publishing questions", async () => {
    vi.useFakeTimers();
    const { env, AI } = environment();
    AI.run.mockImplementation(() => new Promise(() => {}));
    const promise = generateBatch(
      env,
      settings,
      crypto.randomUUID(),
      makePlan(settings),
      [],
      [],
      100,
    );
    const assertion = expect(promise).rejects.toThrow("GENERATION_UNAVAILABLE");
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
  });
  it("sends recent questions and failed skills to generation without a validation call", async () => {
    const { env, AI } = environment();
    await generateBatch(
      env,
      settings,
      crypto.randomUUID(),
      makePlan(settings),
      ["A previous question about driving."],
      ["Suffix selection"],
    );
    expect(JSON.stringify(AI.run.mock.calls[0])).toContain(
      "A previous question about driving.",
    );
    expect(JSON.stringify(AI.run.mock.calls[0])).toContain("Suffix selection");
    expect(JSON.stringify(AI.run.mock.calls[0])).toContain("Create ORIGINAL");
    expect(AI.run).toHaveBeenCalledTimes(10);
  });
  it("enforces origin, rate limits, private session tokens, batch ordering and key expiration", async () => {
    const { env } = environment();
    expect(
      (await worker.fetch(req("generate", settings, "https://evil.test"), env))
        .status,
    ).toBe(403);
    expect(
      (
        await worker.fetch(
          req("generate", { ...settings, topics: ["unknown-topic"] }),
          env,
        )
      ).status,
    ).toBe(400);
    const s = await create(env);
    expect(
      (await batch(env, { ...s, accessToken: "f".repeat(64) }, 0)).status,
    ).toBe(404);
    expect((await batch(env, s, 1)).status).toBe(409);
    vi.useFakeTimers();
    vi.setSystemTime(s.expiresAt + 1);
    expect((await batch(env, s, 0)).status).toBe(410);
    vi.useRealTimers();
    env.GENERATE_LIMIT = { limit: async () => ({ success: false }) };
    expect((await worker.fetch(req("generate", settings), env)).status).toBe(
      429,
    );
  });
});
describe("deterministic quality and grading", () => {
  it("requires statistically, never statistical, in an adverb-before-adjective slot", async () => {
    const q = questionFixture(crypto.randomUUID(), {
      topicId: "word-formation",
      exerciseType: "word_formation",
      ordinal: 0,
    });
    Object.assign(q, {
      questionText: "The difference was ___ significant (p < 0.01).",
      rootWord: "STATISTICS",
      referenceAnswers: ["statistically"],
      answerForm: "adverb",
      constraint: "adverb_before_adjective",
      explanationVi:
        "Adverb statistically bổ nghĩa cho Adjective significant, không dùng statistical.",
    });
    expect(qualityIssues(q)).toEqual([]);
    expect(
      qualityIssues({ ...q, referenceAnswers: ["statistical"] }),
    ).not.toEqual([]);
    expect(qualityIssues({ ...q, answerForm: "adjective" })).toContain(
      "Adverb required before adjective",
    );
    const { env, AI } = environment();
    expect((await gradeGenerated(env, q, "statistically")).score).toBe(1);
    const wrong = await gradeGenerated(env, q, "statistical");
    expect(wrong.score).toBe(0);
    expect(wrong.feedbackVi).toContain("Adverb");
    expect(
      (await gradeGenerated(env, { ...q, constraint: "other" }, "statistical"))
        .score,
    ).toBe(0);
    expect(AI.run).not.toHaveBeenCalled();
  });
  it("detects normalized duplicates, changed numbers and high-overlap changed names", () => {
    expect(similar("The room has 25 seats.", "The room has 60 seats!")).toBe(
      true,
    );
    expect(
      similar(
        "Maria completed the detailed safety report before the public meeting.",
        "David completed the detailed safety report before the public meeting.",
      ),
    ).toBe(true);
    expect(
      similar("The nurse checked the dosage.", "A new train leaves tomorrow."),
    ).toBe(false);
  });
  it("validates four choices, exactly one answer and complete distractor explanations", async () => {
    const q = questionFixture(crypto.randomUUID(), {
      topicId: "word-formation",
      exerciseType: "multiple_choice",
      ordinal: 0,
    });
    expect(qualityIssues(q)).toEqual([]);
    expect(
      qualityIssues({ ...q, acceptedVariants: [q.options[1].text] }),
    ).toContain("Exactly one acceptable MCQ option");
    expect(qualityIssues({ ...q, distractorExplanations: [] })).toContain(
      "Explain every distractor",
    );
    const { env, AI } = environment();
    expect((await gradeGenerated(env, q, "a")).score).toBe(1);
    expect((await gradeGenerated(env, q, "b")).score).toBe(0);
    expect(AI.run).not.toHaveBeenCalled();
    const shuffled = shuffleOptions(q, () => 0);
    expect(shuffled.options.map((o) => o.text)).not.toEqual(
      q.options.map((o) => o.text),
    );
    expect(shuffled.correctOptionId).toBe("d");
    expect((await gradeGenerated(env, shuffled, "d")).score).toBe(1);
    expect((await gradeGenerated(env, shuffled, "a")).score).toBe(0);
    expect(
      shuffled.distractorExplanations.find((d) => d.optionId === "a")
        ?.explanationVi,
    ).toBe(
      q.distractorExplanations.find((d) => d.optionId === "b")?.explanationVi,
    );
    expect(q.options[0].id).toBe("a");
  });
  it("accepts validated words deterministically but sends unfamiliar free-text alternatives to the existing AI grader", async () => {
    const q = questionFixture(crypto.randomUUID(), {
        topicId: "word-formation",
        exerciseType: "sentence_transformation",
        ordinal: 0,
      }),
      { env, AI } = environment();
    expect((await gradeGenerated(env, q, q.referenceAnswers[0])).score).toBe(1);
    expect(AI.run).not.toHaveBeenCalled();
    const answer = "A natural equivalent sentence.";
    AI.run.mockResolvedValue({
      response: {
        status: "correct",
        correctedAnswer: answer,
        alternativeAnswers: [],
        feedbackVi: "Đúng theo ngữ cảnh.",
        explanationVi: "Giữ đúng ý nghĩa của câu gốc.",
        errorSpans: [],
        confidence: 0.95,
      },
    } as never);
    expect((await gradeGenerated(env, q, answer)).score).toBe(1);
    expect(AI.run).toHaveBeenCalled();
  });
  it("keeps provider failures unscored rather than incorrectly grading alternatives", async () => {
    const q = questionFixture(crypto.randomUUID(), {
        topicId: "word-formation",
        exerciseType: "sentence_transformation",
        ordinal: 1,
      }),
      { env, AI } = environment();
    AI.run.mockRejectedValue(Error("quota"));
    await expect(
      gradeGenerated(env, q, "Another valid English sentence."),
    ).rejects.toThrow();
  });
});
describe("exam gating and additive persistence", () => {
  it("withholds feedback until complete exam submission, freezes answers, and grades MCQ by ID", async () => {
    const { env, stores } = environment(),
      s = await create(env, {
        feedbackMode: "exam",
        exerciseType: "multiple_choice",
      });
    const generated = await (await batch(env, s, 0)).json();
    const keys = await stores
      .get(s.sessionId)!
      .get<PrivateQuestion[]>("batch:0");
    const submissions = [
      {
        exerciseId: generated.questions[0].id,
        version: 1,
        userAnswer: keys![0].correctOptionId!,
      },
    ];
    const payload = { sessionId: s.sessionId, accessToken: s.accessToken };
    expect(
      (await worker.fetch(req("grade", { ...payload, submissions }), env))
        .status,
    ).toBe(409);
    expect(
      (await worker.fetch(req("submit-exam", { ...payload, answers: {} }), env))
        .status,
    ).toBe(400);
    const answers = Object.fromEntries(
      keys!.map((q) => [q.id, q.correctOptionId!]),
    );
    expect(
      (await worker.fetch(req("submit-exam", { ...payload, answers }), env))
        .status,
    ).toBe(200);
    const graded = await (
      await worker.fetch(req("grade", { ...payload, submissions }), env)
    ).json();
    expect(graded.results[0].result.score).toBe(1);
    expect(graded.results[0].reveal.referenceAnswers).toBeDefined();
    const replay = await (
      await worker.fetch(
        req("submit-exam", {
          ...payload,
          answers: { ...answers, [submissions[0].exerciseId]: "b" },
        }),
        env,
      )
    ).json();
    expect(replay.answers[submissions[0].exerciseId]).toBe(
      keys![0].correctOptionId,
    );
    submissions[0].userAnswer = keys![0].options.find(
      (o) => o.id !== keys![0].correctOptionId,
    )!.id;
    expect(
      (await worker.fetch(req("grade", { ...payload, submissions }), env))
        .status,
    ).toBe(409);
  });
  it("backs up/resumes the same generated session, preserves old attempts when creating a new session and restoring older backups", async () => {
    const { env } = environment(),
      s = await create(env),
      b = await (await batch(env, s, 0)).json();
    const row: PracticeSession = {
      ...s,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      questions: b.questions,
      nextBatch: 1,
      generationComplete: true,
      answers: { [b.questions[0].id]: "carefully" },
      results: {},
      reveals: {},
      currentIndex: 3,
      status: "practicing",
      examSubmitted: false,
    };
    await saveSession(row);
    const restored = await db.practiceSessions.get(row.sessionId);
    expect(restored?.questions).toEqual(row.questions);
    expect(restored?.currentIndex).toBe(3);
    const q = questionFixture(s.sessionId, {
        topicId: "word-formation",
        exerciseType: "word_formation",
        ordinal: 0,
      }),
      result = await gradeGenerated(env, q, q.referenceAnswers[0]);
    row.results[q.id] = result;
    await saveGraded(row, [result]);
    await saveSession({
      ...row,
      sessionId: crypto.randomUUID(),
      answers: {},
      results: {},
    });
    expect(await db.aiAttempts.count()).toBe(1);
    expect(await db.practiceSessions.count()).toBe(2);
    const backup = await exportBackup();
    expect(backup.version).toBe(9);
    await importBackup(backup);
    expect(await db.practiceSessions.count()).toBe(2);
    const old = { ...backup, version: 3, practiceSessions: undefined };
    await importBackup(old);
    expect(await db.practiceSessions.count()).toBe(2);
    expect(await db.aiAttempts.count()).toBe(1);
    expect(
      summary([
        result,
        {
          ...result,
          status: "needs_review",
          score: null,
          needsReview: true,
          confidence: 0,
        },
      ]),
    ).toMatchObject({ score: 1, maxScore: 1, pending: 1 });
  });
  it("runtime schemas reject malformed generated content and public projection strips keys", () => {
    const q = questionFixture(crypto.randomUUID(), makePlan(settings)[0]);
    expect(
      privateQuestionSchema.safeParse({ ...q, explanationVi: "" }).success,
    ).toBe(false);
    expect(publicQuestion(q)).not.toHaveProperty("referenceAnswers");
    expect(publicQuestion(q)).not.toHaveProperty("explanationVi");
  });
});

it("accepts a complete 50-question exam payload exceeding the smaller generation request limit", async () => {
  const { env } = environment(),
    s = await create(env, {
      questionCount: 50,
      feedbackMode: "exam",
      exerciseType: "paraphrasing",
    });
  const questions = [];
  for (let i = 0; i < 5; i++) {
    const response = await batch(env, s, i);
    expect(response.status).toBe(200);
    questions.push(...(await response.json()).questions);
  }
  const answers = Object.fromEntries(
    questions.map((q) => [
      q.id,
      "A learner sentence with detailed context. ".repeat(70),
    ]),
  );
  const payload = {
    sessionId: s.sessionId,
    accessToken: s.accessToken,
    answers,
  };
  expect(JSON.stringify(payload).length).toBeGreaterThan(32000);
  expect((await worker.fetch(req("submit-exam", payload), env)).status).toBe(
    200,
  );
});

it("bounds single-question authoring concurrency on the authoring model", async () => {
  const { env, AI } = environment();
  env.AI_GENERATION_MODEL = "fast-author";
  env.AI_GENERATION_SCHEMA_STYLE = "workers";
  env.AI_SCHEMA_STYLE = "openai";
  const standard = AI.run.getMockImplementation()!;
  let active = 0,
    peak = 0;
  AI.run.mockImplementation(async (model, input) => {
    if (model === "fast-author") {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
    }
    return standard(model, input);
  });
  await generateBatch(
    env,
    settings,
    crypto.randomUUID(),
    makePlan(settings),
    [],
    [],
  );
  expect(AI.run.mock.calls.map((c) => c[0])).toEqual([
    ...Array.from({ length: 10 }, () => "fast-author"),
  ]);
  expect(peak).toBe(2);
  const first = AI.run.mock.calls[0][1] as {
    messages: { content: string }[];
    response_format: { json_schema: unknown };
  };
  expect(JSON.parse(first.messages[1].content).plan).toHaveLength(1);
  expect(first.response_format.json_schema).toHaveProperty("properties");
});

it("removes redundant key spellings without dropping distinct valid variants and rejects copied roots", () => {
  const cleaned = normalizeQuestionAnswers({
    referenceAnswers: ["carefully", "Carefully."],
    acceptedVariants: [" CAREFULLY ", "with care"],
  });
  expect(cleaned).toEqual({
    referenceAnswers: ["carefully"],
    acceptedVariants: ["with care"],
  });
  const q = questionFixture(crypto.randomUUID(), {
    topicId: "word-formation",
    exerciseType: "word_formation",
    ordinal: 0,
  });
  expect(qualityIssues({ ...q, rootWord: q.referenceAnswers[0] })).toContain(
    "Root already supplies the answer; require a changed word form",
  );
});

it("retries only a failed item while retaining independently questions", async () => {
  const { env, AI } = environment(),
    standard = AI.run.getMockImplementation()!;
  let failed = false;
  AI.run.mockImplementation(async (model, input) => {
    const messages = (input as { messages: { content: string }[] }).messages;
    const payload = JSON.parse(messages[1].content);
    if (
      messages[0].content.startsWith("Create ORIGINAL") &&
      payload.plan[0].ordinal === 3 &&
      !failed
    ) {
      failed = true;
      throw Error("transient provider failure");
    }
    return standard(model, input);
  });
  const questions = await generateBatch(
    env,
    settings,
    crypto.randomUUID(),
    makePlan(settings),
    [],
    [],
  );
  expect(questions.map((q) => q.ordinal)).toEqual(
    Array.from({ length: 10 }, (_, i) => i),
  );
  const authored = AI.run.mock.calls.filter((c) =>
    (
      c[1] as { messages: { content: string }[] }
    ).messages[0].content.startsWith("Create ORIGINAL"),
  );
  expect(authored).toHaveLength(11);
  const ordinals = authored.map(
    (c) =>
      JSON.parse(
        (c[1] as { messages: { content: string }[] }).messages[1].content,
      ).plan[0].ordinal,
  );
  expect(ordinals.filter((n) => n === 3)).toHaveLength(2);
  expect(ordinals.filter((n) => n === 0)).toHaveLength(1);
});

it("supports JSON object authoring while retaining a full runtime output schema", async () => {
  const { env, AI } = environment();
  env.AI_GENERATION_SCHEMA_STYLE = "json_object";
  await callStructured(
    env,
    "Create ORIGINAL",
    { plan: makePlan(settings).slice(0, 1) },
    privateQuestionSchema,
    "grammar_generation",
    new AbortController().signal,
    1400,
  );
  const input = AI.run.mock.calls[0][1] as {
    response_format: { type: string };
    messages: { content: string }[];
  };
  expect(input.response_format).toEqual({ type: "json_object" });
  expect(JSON.parse(input.messages[1].content).outputSchema).toHaveProperty(
    "properties",
  );
});
it("classifies provider failures without exposing provider text or private question data", () => {
  expect(
    providerProblem(
      Error("3030: Daily neuron quota exceeded with private details"),
    ),
  ).toBe("quota_exhausted:3030");
  expect(
    providerProblem(
      Error("unsupported response_format json_schema private details"),
    ),
  ).toBe("schema_unsupported");
  expect(
    providerProblem(Error("private answer and unknown provider failure")),
  ).toBe("provider_error");
});

it("enforces sentence formats and varies authoring contexts without exposing unsupported formats", async () => {
  const { env, AI } = environment();
  await generateBatch(
    env,
    settings,
    crypto.randomUUID(),
    makePlan(settings),
    [],
    [],
  );
  const calls = AI.run.mock.calls
    .map(
      (c) =>
        c[1] as {
          messages: { content: string }[];
          response_format: {
            json_schema: {
              properties: {
                questions: {
                  items: { properties: { answerForm: { const?: string } } };
                };
              };
            };
          };
        },
    )
    .filter((c) => c.messages[0].content.startsWith("Create ORIGINAL"));
  const data = calls.map((c) => JSON.parse(c.messages[1].content));
  expect(new Set(data.map((d) => d.contextCue)).size).toBe(10);
  const correction = calls.find(
    (c) =>
      JSON.parse(c.messages[1].content).plan[0].exerciseType ===
      "error_correction",
  )!;
  expect(correction.messages[0].content).toContain("entire corrected sentence");
  expect(
    correction.response_format.json_schema.properties.questions.items.properties
      .answerForm.const,
  ).toBe("sentence");
  expect(data[2].avoidRootWords.length).toBeGreaterThan(0);
  expect(data[0].topics[0]).not.toHaveProperty("supportedExerciseTypes");
  const q = questionFixture(crypto.randomUUID(), {
    topicId: "word-formation",
    exerciseType: "error_correction",
    ordinal: 0,
  });
  expect(qualityIssues({ ...q, referenceAnswers: ["carefully"] })).toContain(
    "Sentence task requires a complete reference sentence",
  );
});

it("repairs a twice-failed item on the third bounded attempt while keeping accepted peers", async () => {
  const { env, AI } = environment(),
    standard = AI.run.getMockImplementation()!;
  let failures = 0;
  AI.run.mockImplementation(async (model, input) => {
    const messages = (input as { messages: { content: string }[] }).messages,
      data = JSON.parse(messages[1].content);
    if (
      messages[0].content.startsWith("Create ORIGINAL") &&
      data.plan[0].ordinal === 3 &&
      failures < 2
    ) {
      failures++;
      throw Error("transient provider problem");
    }
    return standard(model, input);
  });
  const result = await generateBatch(
    env,
    settings,
    crypto.randomUUID(),
    makePlan(settings),
    [],
    [],
  );
  expect(result).toHaveLength(10);
  const author = AI.run.mock.calls.filter((c) =>
    (
      c[1] as { messages: { content: string }[] }
    ).messages[0].content.startsWith("Create ORIGINAL"),
  );
  expect(author).toHaveLength(12);
});

it("authors non-word-family grammar with the selected rule rather than forced derivation", async () => {
  const { env, AI } = environment(),
    standard = AI.run.getMockImplementation()!;
  AI.run.mockImplementation(async (model, input) => {
    const v = input as { messages: { content: string }[] };
    if (v.messages[0].content.startsWith("Create ORIGINAL")) {
      expect(v.messages[0].content).toContain("not word formation");
      return {
        response: {
          questions: [
            {
              ...contentFixture({
                topicId: "verb-tenses",
                exerciseType: "sentence_transformation",
                ordinal: 0,
              }),
              questionText: "The bus left before I arrived at the station.",
              instruction:
                "Rewrite using the Past Perfect for the earlier action.",
              rootWord: null,
              referenceAnswers: [
                "The bus had left before I arrived at the station.",
              ],
              acceptedVariants: [],
              grammarRules: ["Past Perfect marks the earlier past action"],
              targetSkills: ["Sequence of past events"],
              answerForm: "sentence",
              constraint: "sentence",
            },
          ],
        },
      } as never;
    }
    return standard(model, input);
  });
  const rows = await generateBatch(
    env,
    { ...settings, topics: ["verb-tenses"] },
    crypto.randomUUID(),
    [
      {
        topicId: "verb-tenses",
        exerciseType: "sentence_transformation",
        ordinal: 0,
      },
    ],
    [],
    [],
  );
  expect(rows[0].rootWord).toBeNull();
  expect(rows[0].referenceAnswers[0]).toContain("had left");
});

it("rejects public sentence templates, leaked solutions and hidden opening constraints", () => {
  const base = {
    ...questionFixture(crypto.randomUUID(), {
      topicId: "verb-tenses",
      exerciseType: "sentence_transformation",
      ordinal: 0,
    }),
    rootWord: null,
    questionText:
      "They started maintaining the train lines five years ago and still maintain them.",
    instruction: "Rewrite using the Present Perfect Continuous.",
    referenceAnswers: [
      "They have been maintaining the train lines for five years.",
    ],
    acceptedVariants: [],
    requiredOpening: null,
  };
  expect(qualityIssues(base)).toEqual([]);
  expect(
    qualityIssues({
      ...base,
      questionText: "Complete the second sentence. " + base.questionText,
    }),
  ).toContain(
    "Keep task directions and labelled solutions out of the source sentence",
  );
  expect(
    qualityIssues({
      ...base,
      questionText:
        base.questionText + "\nSource sentence: " + base.referenceAnswers[0],
    }),
  ).toContain(
    "Source contains a complete accepted answer; require a real transformation",
  );
  expect(
    qualityIssues({ ...base, instruction: "Begin with the provided words." }),
  ).toContain("Instruction refers to a missing opening constraint");
  expect(
    qualityIssues({ ...base, requiredOpening: base.referenceAnswers[0] }),
  ).toContain("Opening must not expose a complete answer");
  const valid = { ...base, requiredOpening: "They have been" };
  expect(publicQuestion(valid).requiredOpening).toBe("They have been");
  expect(publicQuestion(valid)).not.toHaveProperty("referenceAnswers");
  expect(
    publicQuestion({ ...base, requiredOpening: base.referenceAnswers[0] })
      .requiredOpening,
  ).toBeNull();
});

it("never publishes a copied rewrite and retries only that slot while retaining the other nine IDs", async () => {
  const { env, AI, stores } = environment();
  const standard = AI.run.getMockImplementation()!;
  let bad = true;
  const authorOrdinals: number[] = [];
  AI.run.mockImplementation(async (model, input) => {
    const v = input as { messages: { content: string }[] };
    const data = JSON.parse(v.messages[1].content);
    const response = await standard(model, input);
    if (v.messages[0].content.startsWith("Create ORIGINAL")) {
      const ordinal = data.plan[0].ordinal;
      authorOrdinals.push(ordinal);
      if (bad && ordinal === 5) {
        const content = (
          response.response as {
            questions: ReturnType<typeof contentFixture>[];
          }
        ).questions[0];
        content.questionText = content.referenceAnswers[0];
      }
    }
    return response;
  });
  const session = await create(env);
  expect((await batch(env, session, 0)).status).toBe(503);
  const checkpoint = (await stores
    .get(session.sessionId)!
    .get<PrivateQuestion[]>("batch:0"))!;
  expect(checkpoint).toHaveLength(9);
  expect(checkpoint.some((q) => q.ordinal === 5)).toBe(false);
  expect(authorOrdinals.filter((n) => n === 5)).toHaveLength(3);
  bad = false;
  const ready = generationResponseSchema.parse(
    await (await batch(env, session, 0)).json(),
  );
  expect(ready.questions).toHaveLength(10);
  expect(
    ready.questions.filter((q) => q.ordinal !== 5).map((q) => q.id),
  ).toEqual(checkpoint.map((q) => q.id));
  expect(authorOrdinals.filter((n) => n !== 5)).toHaveLength(9);
  expect(authorOrdinals.filter((n) => n === 5)).toHaveLength(4);
  expect(JSON.stringify(ready)).not.toContain("targetWord");
});

it("generates an Education set across all supported categories with diverse formats and server-assigned metadata", async () => {
  const { env, AI } = environment();
  const standard = AI.run.getMockImplementation()!;
  AI.run.mockImplementation(async (model, input) => {
    const result = await standard(model, input);
    const data = JSON.parse(
      (input as { messages: { content: string }[] }).messages[1].content,
    );
    const item = data.plan?.[0];
    if (item && item.topicId !== "word-formation")
      for (const q of (
        result.response as { questions: ReturnType<typeof contentFixture>[] }
      ).questions) {
        q.rootWord = null;
        q.targetWord = null;
      }
    return result;
  });
  const s = await create(env, {
    topics: ["all"],
    ieltsTopic: "education",
    questionCount: 20,
  });
  const first = generationResponseSchema.parse(
    await (await batch(env, s, 0)).json(),
  );
  const second = generationResponseSchema.parse(
    await (await batch(env, s, 1)).json(),
  );
  const questions = [...first.questions, ...second.questions];
  expect(questions).toHaveLength(20);
  expect(second.complete).toBe(true);
  expect(new Set(questions.map((q) => q.topicId)).size).toBe(20);
  expect(
    new Set(questions.map((q) => q.exerciseType)).size,
  ).toBeGreaterThanOrEqual(4);
  expect(
    questions.every((q) => q.ieltsTopic === "education" && q.grammarSubtopic),
  ).toBe(true);
  expect(
    questions
      .filter((q) => q.exerciseType === "sentence_reordering")
      .every((q) => q.reorderTokens?.length),
  ).toBe(true);
  expect(JSON.stringify(questions)).not.toMatch(
    /referenceAnswers|correctOptionId|targetWord|gradingCriteria/,
  );
});

it("permits a separate exam retake only after submission and keeps the original frozen answers", async () => {
  const { env, stores } = environment();
  const s = await create(env, {
    exerciseType: "multiple_choice",
    feedbackMode: "exam",
  });
  await batch(env, s, 0);
  const questions = (await stores
    .get(s.sessionId)!
    .get<PrivateQuestion[]>("batch:0"))!;
  const q = questions[0],
    old = q.correctOptionId!,
    changed = q.options.find((o) => o.id !== old)!.id;
  const grade = (retry: boolean, answer: string) =>
    worker.fetch(
      req("grade", {
        sessionId: s.sessionId,
        accessToken: s.accessToken,
        ...(retry ? { retry: true } : {}),
        submissions: [{ exerciseId: q.id, version: 1, userAnswer: answer }],
      }),
      env,
    );
  expect((await grade(true, changed)).status).toBe(409);
  expect(
    (
      await worker.fetch(
        req("submit-exam", {
          sessionId: s.sessionId,
          accessToken: s.accessToken,
          answers: Object.fromEntries(
            questions.map((q) => [q.id, q.correctOptionId]),
          ),
        }),
        env,
      )
    ).status,
  ).toBe(200);
  expect((await grade(true, changed)).status).toBe(200);
  expect((await grade(false, changed)).status).toBe(409);
  expect((await grade(false, old)).status).toBe(200);
});

it("requires genuine error-correction defects instead of false absolute tense rules", async () => {
  const { env, AI } = environment(),
    standard = AI.run.getMockImplementation()!;
  AI.run.mockImplementation(async (model, input) => {
    const result = await standard(model, input);
    const body = result.response as {
      questions: ReturnType<typeof contentFixture>[];
    };
    for (const q of body.questions) {
      q.rootWord = null;
      q.targetWord = null;
    }
    return result;
  });
  const config = {
    ...settings,
    topics: ["verb-tenses"],
    exerciseType: "error_correction" as const,
    difficulty: "A2" as const,
  };
  await generateBatch(
    env,
    config,
    crypto.randomUUID(),
    makePlan(config).slice(0, 1),
    [],
    [],
  );
  const prompt = JSON.stringify(AI.run.mock.calls[0]);
  expect(prompt).toContain("unambiguously malformed");
  expect(prompt).toContain("while/when/since");
  expect(prompt).toContain("will can express willingness");
});

it("puts trusted repair requirements in the author system prompt and designs unambiguous conditional errors", async () => {
  const { env, AI } = environment(),
    standard = AI.run.getMockImplementation()!;
  let calls = 0;
  AI.run.mockImplementation(async (model, input) => {
    const result = await standard(model, input);
    const questions = (
      result.response as { questions: ReturnType<typeof contentFixture>[] }
    ).questions;
    for (const q of questions) {
      q.rootWord = null;
      q.targetWord = null;
      if (calls++ === 0) {
        q.questionText = "If students will study every day, they pass.";
        q.referenceAnswers = ["If students study every day, they pass."];
      }
    }
    return result;
  });
  const config = {
    ...settings,
    topics: ["conditionals"],
    exerciseType: "error_correction" as const,
    difficulty: "A2" as const,
  };
  await generateBatch(
    env,
    config,
    crypto.randomUUID(),
    makePlan(config).slice(0, 1),
    [],
    [],
  );
  const system = (
    AI.run.mock.calls[1][1] as { messages: { content: string }[] }
  ).messages[0].content;
  expect(system).toContain("SERVER REPAIR REQUIREMENT");
  expect(system).toContain("MANDATORY CONDITIONAL ERROR DESIGN");
  expect(system).toContain("willingness");
});
