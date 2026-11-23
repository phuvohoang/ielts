import { afterEach, expect, it, vi } from "vitest";
vi.mock("../../../worker/generation", () => ({ callStructured: vi.fn() }));
import { callStructured } from "../../../worker/generation";
import {
  generateCurriculum,
  handleCurriculum,
} from "../../../worker/curriculum";
import { goldQuestions, allChecks } from "./gold";
import { knowledge, unit } from "./catalog";
import type { Env } from "../../../worker/grading";
class Store {
  data = new Map<string, unknown>();
  async get<T>(key: string) {
    return structuredClone(this.data.get(key)) as T | undefined;
  }
  async put(key: string, value: unknown) {
    this.data.set(key, structuredClone(value));
  }
  async setAlarm(_time: number) {}
  async deleteAll() {
    this.data.clear();
  }
}
const input = { unitId: unit.id, patternIds: knowledge.map((p) => p.id) };
const env = {} as Env;
function mockModel(reject = false) {
  const mock = vi.mocked(callStructured);
  mock.mockImplementation(async (_env, _prompt, raw, _schema, name) => {
    const data = raw as {
      plan: { id: string; patternId: string }[];
      candidates: { id: string }[];
    };
    if (name === "curriculum_author")
      return { questions: goldQuestions(data.plan) };
    if (name === "curriculum_examiner")
      return {
        verdicts: data.candidates.map((q) => ({
          id: q.id,
          checks: { ...allChecks, semantics: !reject },
          confidence: 0.98,
          reason:
            "Independently checked meaning, grammar and all explicit instructions.",
        })),
      };
    if (name === "curriculum_grader")
      return {
        status: "correct",
        confidence: 0.96,
        feedbackVi: "Cách diễn đạt khác vẫn giữ đúng nghĩa và cấu trúc.",
        demonstratesPattern: true,
      };
    throw Error("Unexpected call");
  });
  return mock;
}
function request(
  op: string,
  data: unknown,
  id = "10000000-0000-4000-8000-000000000001",
) {
  return new Request(`https://session/curriculum/${op}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Session-Id": id },
    body: JSON.stringify(data),
  });
}
afterEach(() => {
  vi.resetAllMocks();
});
it("publishes exactly ten questions only after the separate examiner passes; hides private keys", async () => {
  const mock = mockModel();
  const store = new Store();
  const response = await handleCurriculum(
    request("generate", input),
    env,
    store,
  );
  expect(response.status).toBe(200);
  const session = (await response.json()) as { questions: unknown[] };
  expect(session.questions).toHaveLength(10);
  expect(JSON.stringify(session)).not.toContain("expectedAnswer");
  expect(JSON.stringify(session)).not.toContain("rubric");
  expect(mock.mock.calls.map((c) => c[4])).toEqual([
    "curriculum_author",
    "curriculum_examiner",
  ]);
});
it("rejects self-approved author output when the examiner fails and retries at most three times", async () => {
  const mock = mockModel(true);
  await expect(generateCurriculum(env, input)).rejects.toThrow(
    "QUALITY_GATE_REJECTED",
  );
  expect(
    mock.mock.calls.filter((c) => c[4] === "curriculum_examiner"),
  ).toHaveLength(3);
  expect(
    mock.mock.calls.filter((c) => c[4] === "curriculum_author"),
  ).toHaveLength(3);
});
it("does not call the model for unknown source patterns", async () => {
  const mock = mockModel();
  await expect(
    generateCurriculum(env, { ...input, patternIds: ["unverified"] }),
  ).rejects.toThrow();
  expect(mock).not.toHaveBeenCalled();
});
it("accepts semantic alternatives, caches grading and enforces session identity and expiry", async () => {
  const mock = mockModel();
  const store = new Store();
  const generated = await handleCurriculum(
    request("generate", input),
    env,
    store,
  );
  const session = (await generated.json()) as {
    id: string;
    token: string;
    expiresAt: number;
    questions: { id: string }[];
  };
  const answer = {
    id: session.id,
    token: session.token,
    questionId: session.questions[2].id,
    answer: "I know who manages this training centre.",
  };
  const response = await handleCurriculum(request("grade", answer), env, store);
  expect(response.status).toBe(200);
  const grade = (await response.json()) as {
    status: string;
    answer: string;
    expectedAnswer: string;
  };
  expect(grade.status).toBe("correct");
  expect(grade.answer).not.toBe(grade.expectedAnswer);
  await handleCurriculum(request("grade", answer), env, store);
  expect(
    mock.mock.calls.filter((c) => c[4] === "curriculum_grader"),
  ).toHaveLength(1);
  expect(
    (
      await handleCurriculum(
        request("grade", { ...answer, token: "b".repeat(64) }),
        env,
        store,
      )
    ).status,
  ).toBe(404);
  await store.put("curriculum-session", { ...session, expiresAt: 1 });
  expect(
    (await handleCurriculum(request("grade", answer), env, store)).status,
  ).toBe(410);
});

it("semantically grades an unseen valid alternative and enforces session identity and expiry", async () => {
  const mock = mockModel();
  const store = new Store();
  const generated = await handleCurriculum(
    new Request("https://session/curriculum/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": crypto.randomUUID(),
      },
      body: JSON.stringify(input),
    }),
    env,
    store,
  );
  const session = (await generated.json()) as {
    id: string;
    token: string;
    questions: { id: string }[];
    expiresAt: number;
  };
  const answer =
    "The neighbourhood library hosts a free discussion group every Monday.";
  const body = {
    id: session.id,
    token: session.token,
    questionId: session.questions[6].id,
    answer,
  };
  const request = (value = body) =>
    new Request("https://session/curriculum/grade", {
      method: "POST",
      body: JSON.stringify(value),
    });
  const response = await handleCurriculum(request(), env, store);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: "correct", answer });
  expect(
    mock.mock.calls.filter((c) => c[4] === "curriculum_grader"),
  ).toHaveLength(1);
  await handleCurriculum(request(), env, store);
  expect(
    mock.mock.calls.filter((c) => c[4] === "curriculum_grader"),
  ).toHaveLength(1);
  expect(
    (
      await handleCurriculum(
        request({ ...body, token: "c".repeat(64) }),
        env,
        store,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await handleCurriculum(
        request({ ...body, questionId: crypto.randomUUID() }),
        env,
        store,
      )
    ).status,
  ).toBe(400);
  await store.put("curriculum-session", { ...session, expiresAt: 1 });
  expect((await handleCurriculum(request(), env, store)).status).toBe(410);
});
