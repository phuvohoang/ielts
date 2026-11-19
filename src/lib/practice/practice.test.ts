import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import worker from "../../../worker/index";
import {
  GrammarSessions,
  gradeGenerated,
  type SessionEnv,
} from "../../../worker/sessions";
import { contentIssues, normalizeContent } from "../../../worker/practice";
import { publicExerciseSchema, practiceRecordSchema } from "./schema";
import { contentFixture, writingFixture, wavFixture } from "./test-support";
import { db, exportBackup, importBackup } from "../db";
import { questionFixture } from "../ai/dynamic/test-support";
class Storage {
  data = new Map<string, unknown>();
  async get<T>(key: string) {
    return structuredClone(this.data.get(key)) as T | undefined;
  }
  async put(key: string, value: unknown) {
    if (new TextEncoder().encode(JSON.stringify(value)).length > 128 * 1024)
      throw Error("Storage row too large");
    this.data.set(key, structuredClone(value));
  }
  async setAlarm(_time: number) {}
  async deleteAll() {
    this.data.clear();
  }
}
function setup() {
  const AI = {
    run: vi.fn(async (_model: string, input: unknown) => {
      const v = input as {
        response_format: { json_schema: { name: string } };
        messages: { content: string }[];
      };
      const data = JSON.parse(v.messages[1].content);
      switch (v.response_format.json_schema.name) {
        case "skill_authoring":
          return { response: contentFixture(data.settings.skill) };
        case "skill_audit":
          return { response: { valid: true, reasons: [] } };
        case "writing_grade":
          return { response: writingFixture };
        case "comprehension_grade":
          return {
            response: {
              items: Array.from({ length: 5 }, (_, i) => ({
                number: i + 1,
                status: "correct",
                feedbackVi:
                  "Câu trả lời phù hợp với thông tin được nghe hoặc đọc.",
                confidence: 0.95,
              })),
            },
          };
        default:
          throw Error("Unexpected model task");
      }
    }),
  };
  const env: SessionEnv = {
    AI,
    AI_MODEL: "test",
    AI_SCHEMA_STYLE: "openai",
    GEMINI_API_KEY: "test-key",
    ALLOWED_ORIGINS: "https://practice.test",
    GRADE_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
    GENERATE_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
    GLOBAL_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
  };
  const objects = new Map<string, GrammarSessions>(),
    stores = new Map<string, Storage>();
  env.SESSIONS = {
    idFromName: (n) => n,
    get: (id) => {
      const key = String(id);
      if (!objects.has(key)) {
        const storage = new Storage();
        stores.set(key, storage);
        objects.set(key, new GrammarSessions({ storage }, env));
      }
      return objects.get(key)!;
    },
  };
  const post = (op: string, body: unknown, origin = "https://practice.test") =>
    worker.fetch(
      new Request(`https://api.test/api/practice/${op}`, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
  return { AI, env, post, stores };
}
const settings = (skill = "reading") => ({
  skill,
  level: "B2",
  task: "task1",
  focus: "",
  recentTitles: [],
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
beforeEach(async () => {
  await db.practiceRuns.clear();
  await db.practiceAudio.clear();
});
describe("AI skill practice server and data", () => {
  it("audits an original reading exercise, hides private keys, grades through AI and caches immutable submissions", async () => {
    const { AI, post } = setup();
    const created = await post("generate", settings());
    expect(created.status).toBe(200);
    const s = publicExerciseSchema.parse(await created.json());
    expect(s.questions).toHaveLength(5);
    expect(s.passage.length).toBeGreaterThan(200);
    expect(JSON.stringify(s)).not.toMatch(
      /answers|explanationVi|evidence|transcript/,
    );
    const answers = Object.fromEntries(
      s.questions.map((q) => [q.number, "9 am"]),
    );
    const response = await post("grade", { id: s.id, token: s.token, answers });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.score).toBe(5);
    expect(result.reveals[0].explanationVi).toContain("chín");
    expect(AI.run).toHaveBeenCalledTimes(3);
    expect(
      (await post("grade", { id: s.id, token: s.token, answers })).status,
    ).toBe(200);
    expect(AI.run).toHaveBeenCalledTimes(3);
    expect(
      (
        await post("grade", {
          id: s.id,
          token: s.token,
          answers: { ...answers, 1: "changed" },
        })
      ).status,
    ).toBe(409);
    expect(
      (await post("grade", { id: s.id, token: "f".repeat(64), answers }))
        .status,
    ).toBe(404);
    expect(
      (await post("generate", settings(), "https://evil.test")).status,
    ).toBe(403);
  });
  it("does not activate a question rejected by independent audit", async () => {
    const { AI, post } = setup(),
      standard = AI.run.getMockImplementation()!;
    AI.run.mockImplementation(async (m, i) => {
      const v = i as { response_format: { json_schema: { name: string } } };
      return v.response_format.json_schema.name === "skill_audit"
        ? ({
            response: { valid: false, reasons: ["Question is ambiguous"] },
          } as never)
        : standard(m, i);
    });
    expect((await post("generate", settings())).status).toBe(503);
    expect(AI.run).toHaveBeenCalledTimes(4);
  });
  it("serves real WAV audio without exposing the script and reuses cached audio across requests", async () => {
    const { post } = setup();
    const s = publicExerciseSchema.parse(
      await (await post("generate", settings("listening"))).json(),
    );
    expect(s.passage).toBe("");
    expect(JSON.stringify(s)).not.toContain("opens at nine in the morning");
    const bytes = wavFixture();
    const encoded = btoa(String.fromCharCode(...bytes));
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [{ type: "audio", data: encoded }],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const r = await post("audio", { id: s.id, token: s.token });
    expect(r.headers.get("Content-Type")).toBe("audio/wav");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(bytes);
    expect((await post("audio", { id: s.id, token: s.token })).status).toBe(
      200,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.model).toBe("gemini-3.8-flash-lite-tts");
    expect(body.input[0].content[0].text).toBe(
      contentFixture("listening").transcript,
    );
    const answers = Object.fromEntries(
      s.questions.map((q) => [q.number, "nine"]),
    );
    const result = await (
      await post("grade", { id: s.id, token: s.token, answers })
    ).json();
    expect(result.transcript).toBe(contentFixture("listening").transcript);
  });
  it("returns IELTS writing criteria and a practice estimate with only genuine quoted corrections", async () => {
    const { post } = setup();
    const s = publicExerciseSchema.parse(
      await (await post("generate", settings("writing"))).json(),
    );
    expect(s.minWords).toBe(150);
    expect(s.writingPrompt).toContain("letter");
    const result = await (
      await post("grade", {
        id: s.id,
        token: s.token,
        answers: {
          writing:
            "I has attended the event and would like to suggest a change.",
        },
      })
    ).json();
    expect(result.bandEstimate).toBe(6);
    expect(result.writing.corrections).toHaveLength(1);
  });
  it("rejects forged evidence, ambiguous MCQ contracts and excessive answer word limits", () => {
    const c = contentFixture();
    c.questions[0].evidence = "not in the passage";
    c.questions[1].answers = ["more words than allowed here"];
    expect(contentIssues(c, settings() as never).length).toBeGreaterThan(1);
  });
  it("adds v5 backups without losing old progress or new work on an older restore", async () => {
    const { post } = setup();
    const s = publicExerciseSchema.parse(
      await (await post("generate", settings())).json(),
    );
    const row = practiceRecordSchema.parse({
      id: s.id,
      date: Date.now(),
      updatedAt: Date.now(),
      exercise: s,
      answers: { 1: "my draft" },
    });
    await db.practiceRuns.put(row);
    const backup = await exportBackup();
    expect(backup.version).toBe(5);
    expect(backup.practiceRuns[0].answers[1]).toBe("my draft");
    await importBackup({ ...backup, version: 4, practiceRuns: undefined });
    expect(await db.practiceRuns.count()).toBe(1);
    await db.practiceRuns.clear();
    await importBackup(backup);
    expect((await db.practiceRuns.get(s.id))?.answers[1]).toBe("my draft");
  });
  it("uses AI even for a known grammar key in practice-only mode", async () => {
    const { env, AI } = setup();
    env.AI_PRACTICE_ONLY = "true";
    const q = questionFixture(crypto.randomUUID(), {
      topicId: "word-formation",
      exerciseType: "word_formation",
      ordinal: 0,
    });
    AI.run.mockResolvedValue({
      response: {
        status: "correct",
        correctedAnswer: q.referenceAnswers[0],
        alternativeAnswers: [],
        feedbackVi: "Dạng từ đúng trong ngữ cảnh.",
        explanationVi: q.explanationVi,
        errorSpans: [],
        confidence: 0.95,
      },
    } as never);
    expect((await gradeGenerated(env, q, q.referenceAnswers[0])).status).toBe(
      "correct",
    );
    expect(AI.run).toHaveBeenCalledTimes(1);
  });
});

it("accepts NOT GIVEN with no fabricated quote and normalizes only equivalent answer encodings", () => {
  const content = contentFixture();
  content.questions[0] = {
    ...content.questions[0],
    type: "true_false_not_given",
    answers: ["not given"],
    evidence: "",
  };
  content.questions[1] = {
    ...content.questions[1],
    type: "multiple_choice",
    answers: ["Nine"],
    options: [
      { id: "a", text: "Nine" },
      { id: "b", text: "Ten" },
      { id: "c", text: "Eleven" },
      { id: "d", text: "Twelve" },
    ],
  };
  content.questions[2].evidence = "opens   at\nnine";
  const normalized = normalizeContent(content, settings() as never);
  expect(normalized.questions[0].answers).toEqual(["NOT GIVEN"]);
  expect(normalized.questions[0].evidence).toBe("");
  expect(normalized.questions[1].answers).toEqual(["a"]);
  expect(normalized.questions[2].evidence).toBe("opens at nine");
  expect(contentIssues(normalized, settings() as never)).toEqual([]);
  normalized.questions[0].evidence = "opens at nine";
  expect(contentIssues(normalized, settings() as never)).toContain(
    "NOT GIVEN must have empty evidence; independently verify absence from the source",
  );
});
it("never publishes private audit reasons in quality failure diagnostics", async () => {
  const { AI, post } = setup(),
    standard = AI.run.getMockImplementation()!;
  AI.run.mockImplementation(async (m, i) => {
    const v = i as { response_format: { json_schema: { name: string } } };
    if (v.response_format.json_schema.name === "skill_audit")
      return {
        response: {
          valid: false,
          reasons: ["Ambiguous question; the private answer is nine."],
        },
      } as never;
    return standard(m, i);
  });
  const response = await post("generate", settings());
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body.code).toBe("QUALITY_REJECTED");
  expect(body.reasons).toEqual(["ambiguity"]);
  expect(JSON.stringify(body)).not.toContain("nine");
});
