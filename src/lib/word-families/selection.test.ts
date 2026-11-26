import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, expect, it } from "vitest";
import { db, exportBackup, importBackup } from "../db";
import {
  createRun,
  practiceFamilies,
  selectedFamilies,
  parts,
  type FamilyInput,
} from "./model";
import {
  importFamilies,
  saveFamily,
  deleteFamily,
  setFamilySelection,
  clearFamilySelection,
  loadWordFamilies,
  loadSelectedFamilies,
  checkRun,
  saveRun,
} from "./storage";
const data = (meaning_vi: string, noun: string): FamilyInput => ({
  meaning_vi,
  noun: [noun],
  adjective: [],
  adverb: [],
  verb: [],
});
beforeEach(async () => {
  await Promise.all([
    db.wordFamilies.clear(),
    db.wordFamilyRuns.clear(),
    db.wordFamilyWeaknesses.clear(),
    db.wordFamilySelections.clear(),
  ]);
});
it("defaults to unselected, preserves selection on edit/import and deletes only the removed ID", async () => {
  const a = await saveFamily(data("Một", "one")),
    b = await saveFamily(data("Hai", "two"));
  expect((await loadWordFamilies()).selections).toEqual([]);
  await setFamilySelection([a.id, b.id, a.id, "missing"], true);
  expect(await db.wordFamilySelections.count()).toBe(2);
  await saveFamily(data("Đổi nghĩa", "one"), a.id);
  expect(await db.wordFamilySelections.get(a.id)).toBeDefined();
  await importFamilies([data("Ba", "three")]);
  expect(await db.wordFamilySelections.count()).toBe(2);
  await deleteFamily(a.id);
  expect(await db.wordFamilySelections.get(a.id)).toBeUndefined();
  expect(await db.wordFamilySelections.get(b.id)).toBeDefined();
  await clearFamilySelection();
  expect(await db.wordFamilySelections.count()).toBe(0);
  expect(await db.wordFamilies.count()).toBe(2);
});
it("bulk operations preserve IDs outside the filtered result, independently of row order", async () => {
  const families = await Promise.all(
    Array.from({ length: 32 }, (_, i) =>
      saveFamily(data(`Nghĩa ${i}`, `form${i}`)),
    ),
  );
  await setFamilySelection([families[31].id], true);
  const filtered = families.slice(0, 27).map((f) => f.id);
  await setFamilySelection(filtered, true);
  expect(await db.wordFamilySelections.count()).toBe(28);
  const snapshot = (await loadWordFamilies()).selections;
  expect(
    new Set(
      selectedFamilies([...families].reverse(), snapshot).map((f) => f.id),
    ),
  ).toEqual(new Set([...filtered, families[31].id]));
  await setFamilySelection(filtered, false);
  expect((await loadWordFamilies()).selections).toEqual([
    { familyId: families[31].id },
  ]);
});
it("generates exclusively selected families without duplicates, caps counts, and preserves selection after completion", async () => {
  const families = await Promise.all(
    ["a", "b", "c"].map((n, i) => saveFamily(data(`Nghĩa ${i}`, n))),
  );
  await setFamilySelection(
    families.slice(0, 2).map((f) => f.id),
    true,
  );
  const selections = (await loadWordFamilies()).selections,
    selected = practiceFamilies(families, "selected", selections, new Set());
  expect(selected).toHaveLength(2);
  expect(
    practiceFamilies(
      families,
      "selected",
      selections,
      new Set(),
      new Set(families.map((f) => f.id)),
    ),
  ).toEqual(selected);
  let run = createRun(selected, 50, "selected", () => 0);
  expect(run.questions).toHaveLength(2);
  expect(new Set(run.questions.map((q) => q.family.id)).size).toBe(2);
  expect(run.questions.map((q) => q.family.id)).not.toContain(families[2].id);
  expect(
    run.questions.every((q) => new Set(q.order).size === parts.length),
  ).toBe(true);
  expect(createRun(selected, "all", "selected").questions).toHaveLength(2);
  for (let index = 0; index < run.questions.length; index++) {
    run = { ...run, index };
    run.questions[index].answers.noun =
      run.questions[index].family.data.noun[0];
    run = await checkRun(run);
  }
  await saveRun({ ...run, completed: true });
  expect((await loadWordFamilies()).selections).toEqual(selections);
  await clearFamilySelection();
  expect(() =>
    createRun(
      practiceFamilies(families, "selected", [], new Set()),
      10,
      "selected",
    ),
  ).toThrow();
});
it("roundtrips selections in v8 backup and preserves valid selections when restoring v7", async () => {
  const family = await saveFamily(data("Một", "one"));
  await setFamilySelection([family.id], true);
  const backup = await exportBackup();
  expect(backup.version).toBe(8);
  expect(backup.wordFamilySelections).toEqual([{ familyId: family.id }]);
  await clearFamilySelection();
  await importBackup(backup);
  expect(await db.wordFamilySelections.count()).toBe(1);
  await importBackup({
    ...backup,
    version: 7,
    wordFamilySelections: undefined,
  });
  expect(await db.wordFamilySelections.count()).toBe(1);
  await importBackup({
    ...backup,
    version: 7,
    wordFamilySelections: undefined,
    wordFamilies: [],
  });
  expect(await db.wordFamilySelections.count()).toBe(0);
});
it("upgrades v7 vocabulary/history without selecting any words or changing answers", async () => {
  const family = await saveFamily(data("Giữ nguyên", "preserve")),
    run = createRun([family], 10, "all");
  run.questions[0].answers.noun = "original draft";
  const schema = Object.fromEntries(
    db.tables
      .filter((t) => t.name !== "wordFamilySelections")
      .map((t) => [
        t.name,
        [t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)].join(","),
      ]),
  );
  db.close();
  await db.delete();
  const old = new Dexie(db.name);
  old.version(7).stores(schema);
  await old.table("wordFamilies").add(family);
  await old.table("wordFamilyRuns").add(run);
  old.close();
  await db.open();
  const loaded = await loadWordFamilies();
  expect(loaded.families).toEqual([family]);
  expect(loaded.runs[0].questions[0].answers.noun).toBe("original draft");
  expect(loaded.selections).toEqual([]);
});

it("reads selected candidates from current storage rather than an older UI snapshot", async () => {
  const a = await saveFamily(data("Cũ", "old")),
    b = await saveFamily(data("Mới", "new"));
  await setFamilySelection([a.id], true);
  const prior = (await loadWordFamilies()).selections;
  await setFamilySelection([a.id], false);
  await setFamilySelection([b.id], true);
  expect(prior).toEqual([{ familyId: a.id }]);
  expect((await loadSelectedFamilies()).map((f) => f.id)).toEqual([b.id]);
  expect(await loadSelectedFamilies(new Set([a.id]))).toEqual([]);
});
