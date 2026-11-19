import { describe, it, expect } from "vitest";
import { generationResponseSchema } from "./schema";
import { fingerprint } from "./quality";
// Opt-in only. Use an approved staging Worker with the new endpoint deployed; no production default.
const enabled = import.meta.env.RUN_LIVE_GENERATION === "1";
describe.skipIf(!enabled)("real Cloudflare generation integration", () => {
  it("generates two independently validated sessions without repeating exact questions", async () => {
    const endpoint = import.meta.env.GRAMMAR_LIVE_URL,
      origin = import.meta.env.GRAMMAR_LIVE_ORIGIN;
    if (!endpoint?.startsWith("https://") || !origin)
      throw Error(
        "Set GRAMMAR_LIVE_URL and GRAMMAR_LIVE_ORIGIN for an approved staging Worker",
      );
    const count = Number(import.meta.env.GRAMMAR_LIVE_COUNT || 10);
    if (![10, 20, 50].includes(count))
      throw Error("GRAMMAR_LIVE_COUNT must be 10,20 or 50");
    async function post(body: unknown) {
      const response = await fetch(endpoint!, {
        method: "POST",
        headers: { Origin: origin!, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(100000),
      });
      expect(response.status).toBe(200);
      return generationResponseSchema.parse(await response.json());
    }
    let recentQuestions: string[] = [];
    for (let session = 0; session < 2; session++) {
      const created = await post({
        topics: ["word-formation"],
        questionCount: count,
        difficulty: "B2",
        exerciseType: "mixed",
        feedbackMode: "instant",
        recentQuestions,
        failedSkills: ["Word family recall"],
      });
      const questions = [];
      for (let batchIndex = 0; batchIndex < count / 10; batchIndex++) {
        const batch = await post({
          sessionId: created.sessionId,
          accessToken: created.accessToken,
          batchIndex,
        });
        questions.push(...batch.questions);
      }
      expect(questions).toHaveLength(count);
      expect(new Set(questions.map((q) => q.id)).size).toBe(count);
      expect(
        new Set(questions.map((q) => fingerprint(q.questionText))).size,
      ).toBe(count);
      expect(
        questions.some((q) =>
          recentQuestions
            .map(fingerprint)
            .includes(fingerprint(q.questionText)),
        ),
      ).toBe(false);
      expect(new Set(questions.map((q) => q.exerciseType)).size).toBe(6);
      recentQuestions = questions.map((q) => q.questionText);
    }
  }, 1200000);
});
