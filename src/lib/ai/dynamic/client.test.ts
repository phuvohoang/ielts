import { afterEach, expect, it, vi } from "vitest";
import { loadBatch } from "./client";
import {
  localSessionSchema,
  makePlan,
  publicQuestion,
  type Settings,
} from "./schema";
import { questionFixture } from "./test-support";

const settings: Settings = {
  topics: ["word-formation"],
  questionCount: 20,
  difficulty: "B2",
  exerciseType: "mixed",
  feedbackMode: "instant",
};
const sessionId = crypto.randomUUID();
const full = makePlan(settings)
  .slice(0, 10)
  .map((item) => publicQuestion(questionFixture(sessionId, item)));
const partial = full.filter((q) => q.ordinal !== 3);
const session = localSessionSchema.parse({
  sessionId,
  accessToken: "a".repeat(64),
  expiresAt: Date.now() + 10000,
  settings,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  questions: partial,
  nextBatch: 0,
  generationComplete: false,
  answers: {},
  results: {},
  reveals: {},
  currentIndex: 0,
  status: "practicing",
  examSubmitted: false,
});
afterEach(() => vi.unstubAllGlobals());
function respond(questions = partial, nextBatch = 0) {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({
          sessionId,
          accessToken: session.accessToken,
          expiresAt: session.expiresAt,
          settings,
          questions,
          nextBatch,
          complete: false,
        }),
      ),
  );
}
it("accepts a stable partial snapshot and requests only its current unfinished batch", async () => {
  respond();
  expect((await loadBatch(session)).questions).toEqual(partial);
  const init = vi.mocked(fetch).mock.calls[0][1]!;
  expect(JSON.parse(init.body as string)).toMatchObject({
    batchIndex: 0,
    allowPartial: true,
  });
  respond(full, 1);
  expect((await loadBatch(session)).questions).toHaveLength(10);
});
it("rejects replacement, deletion and duplicate ordinals in a partial snapshot", async () => {
  respond(
    partial.map((q, i) => (i === 0 ? { ...q, id: crypto.randomUUID() } : q)),
  );
  await expect(loadBatch(session)).rejects.toThrow();
  respond(partial.slice(1));
  await expect(loadBatch(session)).rejects.toThrow();
  respond([
    ...partial.slice(0, -1),
    { ...partial[0], id: crypto.randomUUID() },
  ]);
  await expect(loadBatch(session)).rejects.toThrow();
});

it("adds a newly public opening to older saved drafts without allowing existing constraints to change", async () => {
  const old = {
    ...session,
    questions: session.questions.map((q) => {
      const { requiredOpening: _opening, ...rest } = q;
      return rest;
    }),
  };
  respond(
    partial.map((q) => ({
      ...q,
      requiredOpening: q.ordinal === 0 ? "The schedule" : null,
    })),
  );
  expect((await loadBatch(old)).questions[0].requiredOpening).toBe(
    "The schedule",
  );
  const current = {
    ...session,
    questions: partial.map((q) => ({
      ...q,
      requiredOpening: q.ordinal === 0 ? "The original" : null,
    })),
  };
  await expect(loadBatch(current)).rejects.toThrow();
});
