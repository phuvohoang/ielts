import { db } from "../db";
import {
  selectionSchema,
  duplicate,
  duplicateIndex,
  familyInputSchema,
  familySchema,
  runSchema,
  grade,
  normalize,
  type FamilyInput,
  type Family,
  type Run,
} from "./model";
// Clock reads timestamp library changes, attempts and persisted drafts.
export async function saveFamily(data: FamilyInput, id?: string) {
  const valid = familyInputSchema.parse(data);
  return db.transaction("rw", db.wordFamilies, async () => {
    if (id && !(await db.wordFamilies.get(id)))
      throw Error("Word family đã bị xóa. Tải lại thư viện.");
    const rows = await db.wordFamilies.toArray();
    if (
      duplicate(
        valid,
        rows.filter((row) => row.id !== id).map((row) => row.data),
      )
    )
      throw Error(
        "Trùng nghĩa tiếng Việt hoặc toàn bộ các dạng từ với một mục đã có.",
      );
    const row = familySchema.parse({
      id: id ?? crypto.randomUUID(),
      data: valid,
      updatedAt: Date.now(),
    });
    await db.wordFamilies.put(row);
    return row;
  });
}
export async function importFamilies(values: FamilyInput[]) {
  const valid = values.map((v) => familyInputSchema.parse(v));
  return db.transaction("rw", db.wordFamilies, async () => {
    const current = duplicateIndex(
      (await db.wordFamilies.toArray()).map((f) => f.data),
    );
    const added: Family[] = [];
    let skipped = 0;
    for (const data of valid) {
      if (current.has(data)) {
        skipped++;
        continue;
      }
      current.add(data);
      added.push({ id: crypto.randomUUID(), data, updatedAt: Date.now() });
    }
    await db.wordFamilies.bulkAdd(added);
    return { added: added.length, skipped };
  });
}
export async function deleteFamily(id: string) {
  await db.transaction(
    "rw",
    db.wordFamilies,
    db.wordFamilyWeaknesses,
    db.wordFamilySelections,
    async () => {
      await db.wordFamilySelections.delete(id);
      await db.wordFamilies.delete(id);
      await db.wordFamilyWeaknesses.delete(id);
    },
  );
}
export async function saveRun(run: Run) {
  await db.wordFamilyRuns.put(runSchema.parse(run));
}
export async function checkRun(run: Run) {
  const valid = runSchema.parse(run),
    q = valid.questions[valid.index];
  if (q.checked) return valid;
  const checked = {
    ...valid,
    updatedAt: Date.now(),
    questions: valid.questions.map((item, i) =>
      i === valid.index ? { ...item, checked: true } : item,
    ),
  };
  await db.transaction(
    "rw",
    db.wordFamilies,
    db.wordFamilyRuns,
    db.wordFamilyWeaknesses,
    async () => {
      const current = await db.wordFamilies.get(q.family.id);
      if (current) {
        const old = await db.wordFamilyWeaknesses.get(current.id),
          wrong = new Set(old?.incorrect ?? []);
        for (const result of grade(q)) {
          // An older session must not change weaknesses against newly edited answer keys.
          if (
            JSON.stringify(current.data[result.part].map(normalize).sort()) !==
            JSON.stringify(q.family.data[result.part].map(normalize).sort())
          )
            continue;
          if (result.correct) wrong.delete(result.part);
          else wrong.add(result.part);
        }
        await db.wordFamilyWeaknesses.put({
          familyId: current.id,
          incorrect: [...wrong],
          updatedAt: Date.now(),
        });
      }
      await db.wordFamilyRuns.put(checked);
    },
  );
  return checked;
}
export async function loadWordFamilies() {
  return db.transaction(
    "r",
    db.wordFamilySelections,
    db.wordFamilies,
    db.wordFamilyRuns,
    db.wordFamilyWeaknesses,
    async () => ({
      selections: (await db.wordFamilySelections.toArray()).map((s) =>
        selectionSchema.parse(s),
      ),
      families: (await db.wordFamilies.toArray()).map((v) =>
        familySchema.parse(v),
      ),
      runs: (
        await db.wordFamilyRuns.orderBy("updatedAt").reverse().toArray()
      ).map((v) => runSchema.parse(v)),
      weaknesses: await db.wordFamilyWeaknesses.toArray(),
    }),
  );
}

export async function loadRun(id: string) {
  return runSchema.parse(await db.wordFamilyRuns.get(id));
}

export async function setFamilySelection(ids: string[], selected: boolean) {
  await db.transaction(
    "rw",
    db.wordFamilies,
    db.wordFamilySelections,
    async () => {
      const valid = (await db.wordFamilies.bulkGet([...new Set(ids)])).flatMap(
        (f) => (f ? [f.id] : []),
      );
      if (selected)
        await db.wordFamilySelections.bulkPut(
          valid.map((familyId) => ({ familyId })),
        );
      else await db.wordFamilySelections.bulkDelete(ids);
    },
  );
}
export async function clearFamilySelection() {
  await db.wordFamilySelections.clear();
}

export async function loadSelectedFamilies(ids?: Set<string>) {
  return db.transaction(
    "r",
    db.wordFamilies,
    db.wordFamilySelections,
    async () => {
      const selected = await db.wordFamilySelections.toArray();
      const rows = await db.wordFamilies.bulkGet(
        selected.map((s) => s.familyId),
      );
      return rows.flatMap((row) =>
        row && (!ids || ids.has(row.id)) ? [familySchema.parse(row)] : [],
      );
    },
  );
}
