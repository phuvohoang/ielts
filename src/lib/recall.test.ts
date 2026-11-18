import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { families } from "./content";
import { blankAnswers, gradeRecall, recallResult } from "./recall";
import { db, exportBackup, importBackup, record } from "./db";
const success = families.find((f) => f.root === "succeed")!;
const development = families.find((f) => f.root === "develop")!;

describe("word-family production grading", () => {
  it("accepts every taught form, independent of order, case or duplicates", () => {
    const result = gradeRecall(development, {
      noun: "DEVELOPER; development; developer",
      adjective: "developing, developed",
      adverb: "none",
      verb: " DEVELOP ",
    });
    expect(recallResult(result)).toBe("correct");
  });
  it("requires all taught forms by default, while one-form mode accepts a subset", () => {
    const answers = {
      noun: "development",
      adjective: "developed",
      adverb: "—",
      verb: "develop",
    };
    expect(gradeRecall(development, answers).noun.missing).toEqual([
      "developer",
    ]);
    expect(recallResult(gradeRecall(development, answers))).toBe("incorrect");
    expect(recallResult(gradeRecall(development, answers, false))).toBe(
      "correct",
    );
  });
  it("accepts explicit missing forms but not an unanswered box", () => {
    const answers = {
      noun: "development, developer",
      adjective: "developed, developing",
      adverb: "N/A",
      verb: "develop",
    };
    expect(recallResult(gradeRecall(development, answers))).toBe("correct");
    expect(
      gradeRecall(development, { ...answers, adverb: "" }).adverb.result,
    ).toBe("incorrect");
    expect(
      gradeRecall(success, { ...blankAnswers(), adverb: "none" }).adverb.result,
    ).toBe("incorrect");
  });
  it("detects known words in the wrong class and leaves unlisted alternatives for review", () => {
    const answers = {
      noun: "success",
      adjective: "successful",
      adverb: "successfully",
      verb: "succeed",
    };
    expect(
      gradeRecall(success, { ...answers, adverb: "successful" }).adverb.result,
    ).toBe("incorrect");
    expect(
      recallResult(
        gradeRecall(success, { ...answers, noun: "success, successor" }),
      ),
    ).toBe("review");
  });
  it("accepts British spelling variants", () => {
    const family = families.find((f) => f.root === "organize")!;
    expect(
      recallResult(
        gradeRecall(family, {
          noun: "organisation",
          adjective: "organised",
          adverb: "none",
          verb: "organise",
        }),
      ),
    ).toBe("correct");
  });
});
describe("recall persistence", () => {
  beforeEach(async () => {
    await db.attempts.clear();
    await db.progress.clear();
    await db.writing.clear();
  });
  it("persists four typed answers, updates reviews once per family, and round-trips backups", async () => {
    const answer =
      "noun: success\nadjective: successful\nadverb: successfully\nverb: succeed";
    await record({
      questionId: `recall-${success.id}`,
      family: success.id,
      type: "Word Family Recall",
      answer,
      result: "correct",
      date: 1000,
    });
    const backup = await exportBackup();
    expect(backup.attempts[0].answer).toBe(answer);
    expect(backup.progress[0].reviews).toBe(1);
    await importBackup(backup);
    expect(await exportBackup()).toEqual(backup);
  });
});
