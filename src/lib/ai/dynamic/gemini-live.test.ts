import { describe, expect, it } from "vitest";
import { generateBatch } from "../../../../worker/generation";
import { infer, type Env } from "../../../../worker/grading";
import { b2Exercises } from "../content";
import { makePlan, type Settings } from "./schema";

// Explicit opt-in. The key is a test-process environment variable, never a VITE_* variable.
const enabled = import.meta.env.RUN_LIVE_GEMINI === "1";
const env = {
  AI_PROVIDER: "gemini",
  GEMINI_API_KEY: import.meta.env.GEMINI_TEST_API_KEY,
  GEMINI_MODEL: "gemini-3.5-flash-lite",
  AI_MODEL: "grader", AI_GENERATION_MODEL: "author",
  AI_SCHEMA_STYLE: "openai", AI_GENERATION_SCHEMA_STYLE: "openai",
  AI_CRITERIA_GRADING: "true", AI_SOURCE_COVERAGE: "true",
} as Env;
describe.skipIf(!enabled)("live Gemini authoring, validation and semantic grading", () => {
  it("publishes a validated ten-question mixed-format bank with Vietnamese explanations", async () => {
    const settings: Settings = { topics: ["word-formation"], questionCount: 10, difficulty: "B2", exerciseType: "mixed", feedbackMode: "instant" };
    const questions = await generateBatch(env, settings, crypto.randomUUID(), makePlan(settings), [], []);
    expect(questions).toHaveLength(10);
    expect(new Set(questions.map(q => q.exerciseType)).size).toBe(6);
    expect(questions.every(q => q.explanationVi.length > 20)).toBe(true);
  }, 100000);
  it.each([
    [16, "The company grew by a substantial amount.", "correct"],
    [16, "The company grow significant.", "incorrect"],
    [25, "The manager appeared to be very confident during the interview.", "correct"],
  ])("grades an uncached sentence %s as %s", async (number, answer, status) => {
    const result = await infer(env, b2Exercises[number - 1], answer);
    expect(result.status).toBe(status);
    expect(result.explanationVi.length).toBeGreaterThan(20);
  }, 60000);
});
