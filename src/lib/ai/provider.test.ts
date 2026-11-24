import { afterEach, describe, expect, it, vi } from "vitest";
import { runModel, providerConfigured, geminiSchema } from "../../../worker/provider";
import type { Env } from "../../../worker/grading";

const env = {
  AI_PROVIDER: "gemini", GEMINI_API_KEY: "test-secret", GEMINI_MODEL: "gemini-3.5-flash-lite",
  AI_MODEL: "grader", AI_GENERATION_MODEL: "author",
} as Env;
const input = {
  messages: [{ role: "system", content: "Tutor" }, { role: "user", content: "Answer data" }],
  max_tokens: 200,
  response_format: { type: "json_schema", json_schema: { name: "test", schema: { type: "object" } } },
};
const options = { signal: new AbortController().signal };
afterEach(() => vi.unstubAllGlobals());
describe("server-side Gemini adapter", () => {
  it("maps structured output, system instruction and cancellation without putting the key in the URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "private reasoning" }, { text: '{"ok":true}' }] } }] }));
    vi.stubGlobal("fetch", fetcher);
    expect(await runModel(env, "grader", input, options)).toEqual({ response: '{"ok":true}' });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    expect(url).not.toContain("test-secret");
    expect(init.signal).toBe(options.signal);
    expect(JSON.parse(init.body)).toMatchObject({ systemInstruction: { parts: [{ text: "Tutor" }] }, contents: [{ role: "user", parts: [{ text: "Answer data" }] }], generationConfig: { responseJsonSchema: { type: "object" }, maxOutputTokens: 200, thinkingConfig: { thinkingLevel: "minimal" } } });
  });
  it("does not fall back to Workers AI when Gemini credentials are missing", async () => {
    const AI = { run: vi.fn() };
    const missing = { ...env, GEMINI_API_KEY: undefined, AI };
    expect(providerConfigured(missing)).toBe(false);
    await expect(runModel(missing, "grader", input, options)).rejects.toThrow("not configured");
    expect(AI.run).not.toHaveBeenCalled();
  });
  it.each(["MAX_TOKENS", "SAFETY"])("rejects %s output instead of grading partial JSON", async finishReason => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ candidates: [{ finishReason, content: { parts: [{ text: "{}" }] } }] })));
    await expect(runModel(env, "grader", input, options)).rejects.toThrow("incomplete or blocked");
  });
  it("redacts provider errors and preserves rate-limit categorization", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("test-secret and student data", { status: 429 })));
    await expect(runModel(env, "grader", input, options)).rejects.toThrow(/^Gemini 429: rate limit$/);
  });
  it("preserves the explicit Cloudflare fallback configuration", async () => {
    const AI = { run: vi.fn().mockResolvedValue({ response: "{}" }) };
    expect(await runModel({ ...env, AI_PROVIDER: "cloudflare", AI }, "grader", input, options)).toEqual({ response: "{}" });
    expect(AI.run).toHaveBeenCalledWith("grader", input, options);
  });
});

it("omits unsupported Gemini multipleOf hints while retaining bounds", () => {
  expect(geminiSchema({type:"object",properties:{band:{type:"number",minimum:0,maximum:9,multipleOf:0.5}}})).toEqual({type:"object",properties:{band:{type:"number",minimum:0,maximum:9}}});
});
