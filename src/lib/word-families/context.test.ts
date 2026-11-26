import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect, vi, afterEach } from "vitest";
import Dexie from "dexie";
import { db, exportBackup, importBackup } from "../db";
import { saveFamily, setFamilySelection, saveRun } from "./storage";
import { createRun, type Family } from "./model";
import {
  contextChoices,
  eligibleContextFamilies,
  planContext,
  validateContextQuestion,
  contextSummary,
  contextIncorrectIds,
  fingerprint,
  type ContextSettings,
  type ContextTask,
  type ContextQuestion,
} from "./context-model";
import {
  generateContextRun,
  answerContext,
  nextContext,
  retryContext,
  contextSource,
  loadContextRuns,
} from "./context-storage";
import { generateWordContext } from "../../../worker/word-context";
import { callStructured } from "../../../worker/generation";
import type { Env } from "../../../worker/grading";
vi.mock("../../../worker/generation", () => ({ callStructured: vi.fn() }));
const sample = {
  meaning_vi: "Thành công",
  noun: ["success"],
  adjective: ["successful"],
  adverb: ["successfully"],
  verb: ["succeed"],
};
const settings: ContextSettings = {
  count: 5,
  source: "selected",
  difficulty: "B2",
  target: "adverb",
};
let family: Family;
function question(t: ContextTask, index = 0): ContextQuestion {
  return {
    word_family_id: t.family.id,
    sentence: `The team has _____ completed project number ${index + 1}.`,
    options: t.options,
    correct_answer: t.correct_answer,
    target_pos: t.target_pos,
    explanation_vi:
      "Cần trạng từ bổ nghĩa cho động từ completed, diễn tả cách nhóm hoàn thành dự án.",
    translation_vi: "Nhóm đã hoàn thành dự án thành công.",
  };
}
beforeEach(async () => {
  await Promise.all([
    db.wordFamilies.clear(),
    db.wordFamilySelections.clear(),
    db.wordFamilyRuns.clear(),
    db.wordFamilyWeaknesses.clear(),
    db.wordContextRuns.clear(),
    db.wordContextCache.clear(),
  ]);
  family = await saveFamily(sample);
  await setFamilySelection([family.id], true);
  vi.mocked(callStructured).mockReset();
});
afterEach(() => vi.unstubAllGlobals());
function mockGeneration(onBatch?: (tasks: ContextTask[]) => void) {
  let count = 0;
  const mock = vi.fn(async (_url: unknown, init: RequestInit) => {
    const { tasks } = JSON.parse(String(init.body)) as { tasks: ContextTask[] };
    onBatch?.(tasks);
    return Response.json({ questions: tasks.map((t) => question(t, count++)) });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}
describe("context vocabulary and deterministic validation", () => {
  it("uses only selected families, balances repeated families/POS, skips homographs and one-POS families", async () => {
    const other = await saveFamily({
      ...sample,
      meaning_vi: "Hiệu quả",
      noun: ["efficiency"],
      adjective: ["efficient"],
      adverb: ["efficiently"],
      verb: [],
    });
    expect((await contextSource(settings)).map((f) => f.id)).toEqual([
      family.id,
    ]);
    for (let trial = 0; trial < 40; trial++) {
      const plan = planContext([family, other], {
        ...settings,
        count: 20,
        target: "all",
        difficulty: "Mixed",
      });
      expect(plan.filter((t) => t.family.id === family.id)).toHaveLength(10);
      expect(new Set(plan.map((t) => t.difficulty))).toEqual(
        new Set(["B1", "B2", "C1"]),
      );
      const counts = ["noun", "adjective", "adverb", "verb"].map(
        (p) => plan.filter((t) => t.target_pos === p).length,
      );
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
    expect(
      eligibleContextFamilies(
        [
          {
            ...family,
            data: {
              ...sample,
              noun: ["work"],
              adjective: [],
              adverb: [],
              verb: ["work"],
            },
          },
        ],
        "all",
      ),
    ).toHaveLength(0);
    expect(
      contextChoices({
        ...family,
        data: { ...sample, adjective: ["successful", "success"] },
      }).find((c) => c.part === "adjective")?.accepted,
    ).toEqual(["successful"]);
  });
  it("rejects foreign IDs, invented forms, alternate target options, duplicate/extra blanks, missing keys and repetitions", () => {
    const task = planContext([family], settings)[0],
      q = question(task);
    expect(validateContextQuestion(q, task)).toEqual(q);
    const bad = [
      { word_family_id: crypto.randomUUID() },
      { options: [...q.options.slice(0, -1), "invented"] },
      { correct_answer: "success" },
      { target_pos: "noun" },
      { options: [q.correct_answer, q.correct_answer] },
      { sentence: "A sentence with _____ and _____." },
      { sentence: "A sentence with no gap at all." },
      { sentence: "An odd ______ gap." },
    ];
    for (const patch of bad)
      expect(() => validateContextQuestion({ ...q, ...patch }, task)).toThrow();
    expect(() =>
      validateContextQuestion(q, task, [q.sentence.toUpperCase()]),
    ).toThrow();
  });
});
describe("context generation, cache, local scoring and persistence", () => {
  it("batches, restricts sources, caches, grades locally and resumes answers without grading calls", async () => {
    const fetch = mockGeneration((tasks) =>
      expect(tasks.every((t) => t.family.id === family.id)).toBe(true),
    );
    const run = await generateContextRun(settings, () => {});
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(run.questions).toHaveLength(5);
    const answered = await answerContext(
      run.id,
      0,
      run.questions[0].item.question.options.find(
        (w) => w !== run.questions[0].item.question.correct_answer,
      )!,
    );
    expect(contextSummary(answered)).toMatchObject({ score: 0, total: 5 });
    expect(contextIncorrectIds([answered], [family]).has(family.id)).toBe(true);
    expect((await loadContextRuns())[0].questions[0].answer).toBe(
      answered.questions[0].answer,
    );
    const again = await generateContextRun(settings, () => {});
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      new Set(again.questions.map((q) => q.item.question.sentence)).size,
    ).toBe(5);
    let current = again;
    for (let i = 0; i < 5; i++) {
      current = await answerContext(
        current.id,
        i,
        current.questions[i].item.question.correct_answer,
      );
      current = await nextContext(current.id);
    }
    expect(contextSummary(current)).toMatchObject({
      score: 5,
      total: 5,
      accuracy: 100,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await db.wordFamilyWeaknesses.count()).toBe(0);
    expect((await db.wordFamilySelections.toArray())[0].familyId).toBe(
      family.id,
    );
    const retry = await retryContext(answered, true);
    expect(retry.questions).toHaveLength(1);
    expect(retry.questions[0].answer).toBeUndefined();
    await setFamilySelection([family.id], false);
    await expect(retryContext(answered, true)).rejects.toThrow();
  });
  it("rejects duplicate generation and changed selections; changed answer sets invalidate cache", async () => {
    mockGeneration();
    await generateContextRun(settings, () => {});
    const updated = await saveFamily(
      { ...sample, adverb: ["triumphantly"] },
      family.id,
    );
    const fetch = mockGeneration();
    await generateContextRun(settings, () => {});
    expect(fetch).toHaveBeenCalledOnce();
    expect(fingerprint(updated)).not.toBe(fingerprint(family));
    await db.wordContextCache.clear();
    mockGeneration(() => {
      void db.wordFamilySelections.clear();
    });
    await expect(generateContextRun(settings, () => {})).rejects.toThrow(
      "lựa chọn",
    );
    await setFamilySelection([family.id], true);
    await db.wordContextCache.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const t = JSON.parse(init.body).tasks[0];
        return Response.json({
          questions: Array.from({ length: 5 }, () => question(t)),
        });
      }),
    );
    await expect(generateContextRun(settings, () => {})).rejects.toThrow();
  });
  it("roundtrips v9 context tables, preserves them with old backups and preserves Recall", async () => {
    mockGeneration();
    const run = await generateContextRun(settings, () => {});
    const recall = createRun([family], 10, "all");
    await saveRun(recall);
    const backup = await exportBackup();
    expect(backup.version).toBe(9);
    expect(backup.wordContextRuns).toHaveLength(1);
    await db.wordContextRuns.clear();
    await db.wordContextCache.clear();
    await importBackup(backup);
    expect((await loadContextRuns())[0]).toEqual(run);
    expect(await db.wordFamilyRuns.get(recall.id)).toEqual(recall);
    await importBackup({
      ...backup,
      version: 8,
      wordContextRuns: undefined,
      wordContextCache: undefined,
    });
    expect(await db.wordContextRuns.count()).toBe(1);
    await expect(
      importBackup({ ...backup, wordContextRuns: undefined }),
    ).rejects.toThrow();
  });
  it("upgrades an existing v8 database without removing vocabulary, selections or Recall history", async () => {
    const name = `context-upgrade-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(8).stores({
      wordFamilies: "id",
      wordFamilySelections: "familyId",
      wordFamilyRuns: "id",
    });
    await old.open();
    await old.table("wordFamilies").put(family);
    await old.table("wordFamilySelections").put({ familyId: family.id });
    old.close();
    const next = new Dexie(name);
    next.version(8).stores({
      wordFamilies: "id",
      wordFamilySelections: "familyId",
      wordFamilyRuns: "id",
    });
    next.version(9).stores({
      wordContextRuns: "id,updatedAt",
      wordContextCache: "id,createdAt",
    });
    await next.open();
    expect(await next.table("wordFamilies").get(family.id)).toEqual(family);
    expect(await next.table("wordFamilySelections").count()).toBe(1);
    expect(await next.table("wordContextRuns").count()).toBe(0);
    await next.delete();
  });
});
describe("independent linguistic gate", () => {
  function review(q: ContextQuestion, ambiguous = false) {
    return {
      reviews: [
        {
          sentence: q.sentence,
          grammatical: true,
          natural: true,
          target_pos_correct: true,
          difficulty_matches: true,
          explanation_teaches_rule: true,
          translation_accurate: true,
          valid_options: ambiguous ? q.options.slice(0, 2) : [q.correct_answer],
          reason: "Checked every unchanged option.",
        },
      ],
    };
  }
  it("rejects ambiguity, regenerates once, and only returns independently accepted questions", async () => {
    const task = planContext([family], settings)[0],
      q = question(task),
      q2 = question(task, 2);
    vi.mocked(callStructured)
      .mockResolvedValueOnce({ questions: [q] })
      .mockResolvedValueOnce(review(q, true))
      .mockResolvedValueOnce({ questions: [q2] })
      .mockResolvedValueOnce(review(q2));
    expect(
      await generateWordContext({} as Env, { tasks: [task], avoid: [] }),
    ).toEqual({ questions: [q2] });
    expect(callStructured).toHaveBeenCalledTimes(4);
  });
  it("never returns known ambiguous items or invented vocabulary after the retry limit", async () => {
    const task = planContext([family], settings)[0],
      q = question(task);
    vi.mocked(callStructured).mockImplementation(
      async (_e, _p, _i, _s, name) =>
        name === "word_context_author" ? { questions: [q] } : review(q, true),
    );
    await expect(
      generateWordContext({} as Env, { tasks: [task], avoid: [] }),
    ).rejects.toThrow("Chưa tạo");
    expect(callStructured).toHaveBeenCalledTimes(4);
    vi.mocked(callStructured)
      .mockReset()
      .mockResolvedValue({
        questions: [{ ...q, options: ["invented", "succeed"] }],
      });
    await expect(
      generateWordContext({} as Env, { tasks: [task], avoid: [] }),
    ).rejects.toThrow();
    expect(callStructured).toHaveBeenCalledTimes(2);
  });
});

describe("existing Worker route integration", () => {
  it("keeps origin/rate/body guards and returns a checked batch without a new service", async () => {
    const worker = (await import("../../../worker/index")).default;
    const task = planContext([family], settings)[0],
      q = question(task);
    const env = {
      AI_PROVIDER: "gemini",
      AI_MODEL: "existing",
      GEMINI_MODEL: "gemini-flash",
      GEMINI_API_KEY: "test",
      ALLOWED_ORIGINS: "https://phuvohoang.github.io",
      GRADE_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
      GLOBAL_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
      GENERATE_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
    };
    const request = (
      origin = "https://phuvohoang.github.io",
      body: unknown = { tasks: [task], avoid: [] },
    ) =>
      new Request("https://worker/api/word-families/context", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const typed = env as Parameters<typeof worker.fetch>[1];
    expect(
      (await worker.fetch(request("https://untrusted.example"), typed)).status,
    ).toBe(403);
    expect(
      (await worker.fetch(request(undefined, { tasks: [] }), typed)).status,
    ).toBe(400);
    env.GENERATE_LIMIT.limit.mockResolvedValueOnce({ success: false });
    expect((await worker.fetch(request(), typed)).status).toBe(429);
    vi.mocked(callStructured)
      .mockResolvedValueOnce({ questions: [q] })
      .mockResolvedValueOnce({
        reviews: [
          {
            sentence: q.sentence,
            grammatical: true,
            natural: true,
            target_pos_correct: true,
            difficulty_matches: true,
            explanation_teaches_rule: true,
            translation_accurate: true,
            valid_options: [q.correct_answer],
            reason: "Every option checked.",
          },
        ],
      });
    const response = await worker.fetch(request(), typed);
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://phuvohoang.github.io",
    );
    expect(await response.json()).toEqual({ questions: [q] });
  });
});
