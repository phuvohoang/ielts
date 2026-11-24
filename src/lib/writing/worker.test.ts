import { getPracticeResult, putPracticeResult } from "../../../worker/practice";
import type { PracticeResult } from "../practice/schema";
import { afterEach, expect, it, vi } from "vitest";
import worker from "../../../worker/index";
import { GrammarSessions, type SessionEnv } from "../../../worker/sessions";
import {
  assessmentFixture,
  essayFixture,
  taskFixture,
  patternFixture,
} from "./test-support";
class Store {
  values = new Map<string, unknown>();
  async get<T>(k: string) {
    return structuredClone(this.values.get(k)) as T | undefined;
  }
  async put(k: string, v: unknown) {
    if (new TextEncoder().encode(JSON.stringify(v)).length > 128000)
      throw Error("large");
    this.values.set(k, structuredClone(v));
  }
  async setAlarm(_n: number) {}
  async deleteAll() {
    this.values.clear();
  }
}
function setup() {
  const stores = new Map<string, Store>(),
    objects = new Map<string, GrammarSessions>();
  const AI = {
    run: vi.fn(async (_model: string, input: unknown) => {
      const v = input as {
        response_format: { json_schema: { name: string } };
        messages: { content: string }[];
      };
      const data = JSON.parse(v.messages[1].content);
      switch (v.response_format.json_schema.name) {
        case "writing_assessment":
          return { response: assessmentFixture() };
        case "writing_review_exercise":
          return {
            response: {
              promptVi:
                data.level === 4
                  ? "Viết 40–80 từ về một cuộc họp ở khu phố mới."
                  : "Sửa câu sau theo ngữ cảnh.",
              promptEn:
                data.level === 4
                  ? ""
                  : "My neighbour have organised the meeting yesterday.",
              context: "A neighbourhood meeting about a new recycling service",
              referenceAnswers: [
                "My neighbour organised the meeting yesterday.",
              ],
              rubric:
                "Assess auxiliary agreement and meaning; accept equivalent English.",
            },
          };
        case "writing_review_grade":
          return {
            response: {
              status: "correct",
              feedbackVi:
                "Cách diễn đạt khác vẫn đúng ngữ pháp và phù hợp ngữ cảnh.",
              correction: "My neighbour organised the meeting yesterday.",
              alternatives: [],
              confidence: 0.95,
              contextualEvidence: true,
            },
          };
        default:
          throw Error("unexpected task");
      }
    }),
  };
  const env = {
    AI,
    AI_MODEL: "test",
    AI_SCHEMA_STYLE: "openai",
    ALLOWED_ORIGINS: "https://writing.test",
    GRADE_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
    GLOBAL_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
    GENERATE_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
  } as unknown as SessionEnv;
  env.SESSIONS = {
    idFromName: (id) => id,
    get: (id) => {
      const key = String(id);
      if (!objects.has(key)) {
        const storage = new Store();
        stores.set(key, storage);
        objects.set(key, new GrammarSessions({ storage }, env));
      }
      return objects.get(key)!;
    },
  };
  const post = (op: string, body: unknown, origin = "https://writing.test") =>
    worker.fetch(
      new Request(`https://worker/api/writing/${op}`, {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          "CF-Connecting-IP": "test",
        },
        body: JSON.stringify(body),
      }),
      env,
    );
  return { post, AI, env, stores };
}
afterEach(() => vi.unstubAllGlobals());
it("validates assessment payloads, preserves exact wording and caches identical submissions without returning a key", async () => {
  const { post, AI } = setup();
  const body = {
    essayId: crypto.randomUUID(),
    task: "task1",
    prompt: taskFixture,
    essay: essayFixture,
  };
  const first = await post("assess", body);
  expect(first.status).toBe(200);
  const a = await first.json();
  expect(a.originalEssay).toBe(essayFixture);
  expect(a.omissions).toHaveLength(1);
  expect(JSON.stringify(a)).not.toContain("API_KEY");
  await post("assess", body);
  expect(AI.run).toHaveBeenCalledTimes(1);
  expect((await post("assess", { ...body, essay: "different" })).status).toBe(
    409,
  );
  expect((await post("assess", { ...body, task: "academic" })).status).toBe(
    400,
  );
});
it("keeps reference answers private, semantically accepts a non-reference answer and freezes its exact wording", async () => {
  const { post } = setup(),
    pattern = patternFixture();
  const response = await post("exercise", {
    patternId: pattern.id,
    pattern,
    level: 3,
  });
  expect(response.status).toBe(200);
  const exercise = await response.json();
  expect(exercise.referenceAnswers).toBeUndefined();
  expect(exercise.rubric).toBeUndefined();
  const answer = "My neighbour arranged yesterday’s meeting.";
  const result = await (
    await post("grade", { id: exercise.id, token: exercise.token, answer })
  ).json();
  expect(result.status).toBe("correct");
  expect(result.answer).toBe(answer);
  expect(result.correction).toBe(answer);
  expect(result.referenceAnswers).not.toContain(answer);
  expect(
    (await post("grade", { id: exercise.id, token: "f".repeat(64), answer }))
      .status,
  ).toBe(404);
});
it("does not count underlength level-four writing as contextual mastery evidence", async () => {
  const { post } = setup(),
    pattern = patternFixture();
  const exercise = await (
    await post("exercise", { patternId: pattern.id, pattern, level: 4 })
  ).json();
  expect(exercise.promptVi).not.toContain(pattern.targetPattern);
  const result = await (
    await post("grade", {
      id: exercise.id,
      token: exercise.token,
      answer: "A short but grammatically correct answer.",
    })
  ).json();
  expect(result.contextualEvidence).toBe(false);
});
it("rejects repeated exercise contexts and fails safely on malformed AI outputs", async () => {
  const { post, AI } = setup(),
    pattern = patternFixture();
  const response = await post("exercise", {
    patternId: pattern.id,
    pattern,
    level: 2,
    recentContexts: ["A neighbourhood meeting about a new recycling service"],
  });
  expect(response.status).toBe(503);
  AI.run.mockResolvedValueOnce({ response: { bad: "output" } } as never);
  const fail = await post("assess", {
    essayId: crypto.randomUUID(),
    task: "task1",
    prompt: taskFixture,
    essay: essayFixture,
  });
  expect(fail.status).toBe(400);
  expect(await fail.text()).not.toContain(essayFixture);
});
it("enforces origin and rate limits before any model request", async () => {
  const { post, env, AI } = setup();
  const input = {
    essayId: crypto.randomUUID(),
    task: "task2",
    prompt: taskFixture,
    essay: essayFixture,
  };
  expect((await post("assess", input, "https://evil.test")).status).toBe(403);
  vi.mocked(env.GRADE_LIMIT.limit).mockResolvedValue({ success: false });
  expect((await post("assess", input)).status).toBe(429);
  expect(AI.run).not.toHaveBeenCalled();
});
it("uses Gemini native JSON schema and the server-only Flash model override", async () => {
  const { post, env } = setup();
  env.AI_PROVIDER = "gemini";
  env.GEMINI_API_KEY = "server-only-test";
  env.GEMINI_MODEL = "gemini-default-flash";
  env.GEMINI_WRITING_MODEL = "gemini-writing-flash";
  const fetchMock = vi.fn(async () =>
    Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify(assessmentFixture()) }] },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  expect(
    (
      await post("assess", {
        essayId: crypto.randomUUID(),
        task: "task1",
        prompt: taskFixture,
        essay: essayFixture,
      })
    ).status,
  ).toBe(200);
  const [url, init] = fetchMock.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toContain("gemini-writing-flash");
  const body = JSON.parse(init.body as string);
  expect(body.generationConfig.responseMimeType).toBe("application/json");
  expect(
    body.generationConfig.responseJsonSchema.properties.criteria,
  ).toBeDefined();
});

it("persists large Writing practice results in chunks while reading legacy sessions", async () => {
 const storage = new Store();
 const result = { writingAssessment: { originalEssay: "Tiếng Việt ".repeat(30000) } } as unknown as PracticeResult;
 await putPracticeResult(storage, result);
 expect(await getPracticeResult(storage)).toEqual(result);
 const legacy = new Store(); await legacy.put("result", {items: []});
 expect(await getPracticeResult(legacy)).toEqual({items: []});
});
