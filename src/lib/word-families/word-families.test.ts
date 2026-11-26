import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { db, exportBackup, importBackup } from "../db";
import {
  createRun,
  resumeRun,
  practiceFamilies,
  familyInputSchema,
  grade,
  summarize,
  parts,
  shuffle,
} from "./model";
import { parseImport, previewImport, toCsv } from "./import";
import {
  saveFamily,
  importFamilies,
  deleteFamily,
  saveRun,
  checkRun,
  loadWordFamilies,
  loadRun,
} from "./storage";
const sample = {
  meaning_vi: "Sự phân tích",
  noun: ["analysis"],
  adjective: ["analytical", "analytic"],
  adverb: ["analytically"],
  verb: ["analyse", "analyze"],
};
beforeEach(async () => {
  await Promise.all([
    db.wordFamilies.clear(),
    db.wordFamilyRuns.clear(),
    db.wordFamilyWeaknesses.clear(),
  ]);
});
describe("Word Families import and CRUD", () => {
  it("validates JSON without inventing missing forms and preserves all alternatives", () => {
    const rows = parseImport(
      JSON.stringify([
        sample,
        {
          meaning_vi: "Hiệu suất",
          noun: ["efficiency"],
          adjective: ["efficient"],
          adverb: ["efficiently"],
          verb: [],
        },
      ]),
      "json",
    );
    expect(rows[0].data?.verb).toEqual(["analyse", "analyze"]);
    expect(rows[1].data?.verb).toEqual([]);
    expect(
      parseImport(
        JSON.stringify([{ meaning_vi: "Missing", noun: "wrong type" }]),
        "json",
      )[0].error,
    ).toBeTruthy();
    expect(
      familyInputSchema.safeParse({ meaning_vi: "Empty", noun: [], verb: [] })
        .success,
    ).toBe(false);
  });
  it("roundtrips quoted CSV, commas, BOM, multiline meanings, and pipe alternatives", () => {
    const data = { ...sample, meaning_vi: 'Phân tích, "chi tiết"\nDòng hai' };
    const parsed = parseImport(toCsv([data]), "csv");
    expect(parsed[0].data).toEqual(data);
    expect(() => parseImport("meaning_vi,noun,verb\nx,y,z", "csv")).toThrow();
    expect(() =>
      parseImport('meaning_vi,noun,adjective,adverb,verb\n"unfinished', "csv"),
    ).toThrow();
    expect(() => parseImport("{}", "json")).toThrow();
  });
  it("detects duplicates against the library and inside a file, then rechecks at confirmation", async () => {
    const rows = parseImport(
      JSON.stringify([sample, { ...sample, meaning_vi: "Cùng họ từ" }]),
      "json",
    );
    expect(previewImport(rows, []).map((r) => r.duplicate)).toEqual([
      false,
      true,
    ]);
    expect(
      await importFamilies(rows.flatMap((r) => (r.data ? [r.data] : []))),
    ).toEqual({ added: 1, updated: 1 });
    expect(await importFamilies([sample])).toEqual({ added: 0, updated: 1 });
    expect(await db.wordFamilies.count()).toBe(1);
  });
  it("upserts matching entries atomically, preserving IDs, selections and historical snapshots", async () => {
    const original = await saveFamily(sample);
    const other = await saveFamily({
      ...sample,
      meaning_vi: "Khác",
      noun: ["difference"],
    });
    await db.wordFamilySelections.put({ familyId: original.id });
    const run = createRun([original], 10, "all");
    await saveRun(run);
    const replacement = { ...sample, noun: ["new noun"], verb: [] };
    expect(await importFamilies([replacement])).toEqual({
      added: 0,
      updated: 1,
    });
    expect(await db.wordFamilies.get(original.id)).toMatchObject({
      data: replacement,
    });
    expect(await db.wordFamilies.get(other.id)).toEqual(other);
    expect(await db.wordFamilySelections.get(original.id)).toBeDefined();
    expect((await loadRun(run.id)).questions[0].family.data).toEqual(sample);
    await importFamilies([{ ...replacement, meaning_vi: "Đổi nghĩa" }]);
    expect((await db.wordFamilies.get(original.id))?.data.meaning_vi).toBe(
      "Đổi nghĩa",
    );
    const before = await db.wordFamilies.toArray();
    await expect(
      importFamilies([
        { ...replacement, meaning_vi: "Mới", noun: ["fresh"] },
        { ...replacement, meaning_vi: "Khác" },
      ]),
    ).rejects.toThrow("khớp nhiều mục");
    expect(await db.wordFamilies.toArray()).toEqual(before);
    await expect(
      importFamilies([replacement, { ...sample, noun: [""] }]),
    ).rejects.toThrow();
    expect(await db.wordFamilies.toArray()).toEqual(before);
  });
  it("adds, edits, rejects duplicates and deletes without rewriting historical questions", async () => {
    const family = await saveFamily(sample);
    const run = createRun([family], 10, "all");
    await saveRun(run);
    await saveFamily({ ...sample, verb: ["analyse"] }, family.id);
    expect((await loadRun(run.id)).questions[0].family.data.verb).toEqual([
      "analyse",
      "analyze",
    ]);
    await expect(saveFamily(sample)).rejects.toThrow(/Trùng/);
    await deleteFamily(family.id);
    expect(await db.wordFamilies.count()).toBe(0);
    expect(await db.wordFamilyRuns.count()).toBe(1);
    await expect(saveFamily(sample, family.id)).rejects.toThrow(/xóa/);
  });
});
describe("local practice and persistence", () => {
  it("samples without duplicates, caps to available rows, supports All, fixes each field order", async () => {
    const families = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        saveFamily({
          ...sample,
          meaning_vi: `Nghĩa ${i}`,
          noun: [`noun${i}`],
          adjective: [],
          adverb: [],
          verb: [],
        }),
      ),
    );
    let seed = 31;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const run = createRun(families, 10, "all", random);
    expect(run.questions).toHaveLength(10);
    expect(new Set(run.questions.map((q) => q.family.id)).size).toBe(10);
    for (const question of run.questions) expect(question.order).toEqual(parts);
    expect(createRun(families, 50, "all").questions).toHaveLength(12);
    expect(createRun(families, "all", "all").questions).toHaveLength(12);
    expect(shuffle(families, () => 0).map((x) => x.id)).not.toEqual(
      families.map((x) => x.id),
    );
    expect(() => createRun([], 10, "all")).toThrow();
  });
  it("accepts only explicit alternatives with case and whitespace normalisation, never fuzzy spelling", async () => {
    const family = await saveFamily({ ...sample, adverb: [] });
    const run = createRun([family], 10, "all");
    const q = run.questions[0];
    q.answers = {
      noun: "  ANALYSIS  ",
      adjective: "analytic",
      verb: "analyze",
    };
    expect(grade(q).every((x) => x.correct)).toBe(true);
    expect(grade(q)).toHaveLength(2);
    q.answers.noun = "analysys";
    expect(grade(q).find((x) => x.part === "noun")?.correct).toBe(false);
    q.answers.verb = "ANALYZE";
    q.checked = true;
    const stats = summarize(run);
    expect(stats.score).toBe(1);
    expect(stats.total).toBe(2);
    expect(stats.accuracy).toBe(50);
    expect(stats.fullyCorrect).toBe(0);
    expect(stats.byPart.find((p) => p.part === "adverb")?.total).toBe(0);
  });
  it("persists drafts, results and per-form weaknesses; later correct answers clear the relevant weakness", async () => {
    const family = await saveFamily(sample);
    let run = createRun([family], 10, "all");
    run.questions[0].answers = {
      noun: "bad",
      adjective: "analytic",
      adverb: "analytically",
      verb: "analyze",
    };
    await saveRun(run);
    expect((await loadRun(run.id)).questions[0].answers.noun).toBe("bad");
    run = await checkRun(run);
    expect((await db.wordFamilyWeaknesses.get(family.id))?.incorrect).toEqual([
      "noun",
    ]);
    expect(run.questions[0].answers.noun).toBe("bad");
    const retry = createRun([family], 10, "incorrect");
    retry.questions[0].answers = {
      noun: "analysis",
      adjective: "analytical",
      adverb: "analytically",
      verb: "analyse",
    };
    await checkRun(retry);
    expect((await db.wordFamilyWeaknesses.get(family.id))?.incorrect).toEqual(
      [],
    );
    expect((await loadWordFamilies()).runs).toHaveLength(2);
  });
  it("does not record obsolete mistakes against edited keys or deleted families", async () => {
    const family = await saveFamily(sample),
      run = createRun([family], 10, "all");
    await saveFamily({ ...sample, noun: ["new noun"] }, family.id);
    await checkRun(run);
    expect(
      (await db.wordFamilyWeaknesses.get(family.id))?.incorrect,
    ).not.toContain("noun");
    await deleteFamily(family.id);
    await checkRun(createRun([family], 10, "all"));
    expect(await db.wordFamilyWeaknesses.count()).toBe(0);
  });
  it("includes all new tables in current backups and preserves them when restoring a legacy v6 backup", async () => {
    const family = await saveFamily(sample);
    await checkRun(createRun([family], 10, "all"));
    const backup = await exportBackup();
    expect(backup.version).toBe(8);
    await db.wordFamilies.clear();
    await db.wordFamilyRuns.clear();
    await db.wordFamilyWeaknesses.clear();
    await importBackup(backup);
    expect(await db.wordFamilies.count()).toBe(1);
    expect(await db.wordFamilyRuns.count()).toBe(1);
    expect(await db.wordFamilyWeaknesses.count()).toBe(1);
    const legacy = { ...backup, version: 6 };
    await importBackup(legacy);
    expect(await db.wordFamilies.count()).toBe(1);
  });
});

it("upgrades an existing v6 database without losing prior attempts", async () => {
  const schema = Object.fromEntries(
    db.tables
      .filter((t) => !t.name.startsWith("wordFamil"))
      .map((t) => [
        t.name,
        [t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)].join(","),
      ]),
  );
  db.close();
  await db.delete();
  const legacy = new Dexie(db.name);
  legacy.version(6).stores(schema);
  await legacy.table("attempts").add({
    questionId: "legacy-q",
    family: "legacy",
    type: "test",
    answer: "old",
    result: "correct",
    date: 1,
  });
  legacy.close();
  await db.open();
  expect(await db.attempts.where("questionId").equals("legacy-q").count()).toBe(
    1,
  );
  await saveFamily(sample);
  expect(await db.wordFamilies.count()).toBe(1);
});

it("uses the verb as a clue without scoring it, while preserving completed legacy scores", async () => {
  const family = await saveFamily(sample),
    run = createRun([family], 10, "all");
  const answers = {
    noun: "analysis",
    adjective: "analytic",
    adverb: "analytically",
    verb: "wrong",
  };
  run.questions[0].answers = answers;
  run.questions[0].checked = true;
  run.completed = true;
  expect(run.questions[0].verbGiven).toBe(true);
  expect(grade(run.questions[0]).map((x) => x.part)).toEqual([
    "noun",
    "adjective",
    "adverb",
  ]);
  expect(summarize(run)).toMatchObject({
    score: 3,
    total: 3,
    accuracy: 100,
    fullyCorrect: 1,
  });
  expect(summarize(run).byPart.some((x) => x.part === "verb")).toBe(false);
  const legacy = {
    ...run,
    questions: run.questions.map((q) => ({ ...q, verbGiven: undefined })),
  };
  expect(resumeRun(legacy)).toBe(legacy);
  await saveRun(legacy);
  expect(summarize(await loadRun(legacy.id))).toMatchObject({
    score: 3,
    total: 4,
    accuracy: 75,
  });
  const draft = { ...legacy, completed: false };
  await saveRun(draft);
  const resumed = await loadRun(draft.id);
  expect(resumed.questions[0].verbGiven).toBe(true);
  expect(resumed.questions[0].answers.verb).toBe("wrong");
  expect(summarize(resumed).total).toBe(3);
});
it("keeps verb-only entries in the library but excludes them from new practice pools", async () => {
  const only = await saveFamily({
    meaning_vi: "Chỉ có động từ",
    noun: [],
    adjective: [],
    adverb: [],
    verb: ["exist"],
  });
  expect(practiceFamilies([only], "all", [], new Set())).toEqual([]);
  expect(() => createRun([only], 10, "all")).toThrow();
  expect(await db.wordFamilies.count()).toBe(1);
});
