import { test, expect, type Page } from "@playwright/test";
const data = [
  {
    meaning_vi: "Sự phân tích",
    noun: ["analysis"],
    adjective: ["analytical", "analytic"],
    adverb: ["analytically"],
    verb: ["analyse", "analyze"],
  },
  {
    meaning_vi: "Hiệu suất",
    noun: ["efficiency"],
    adjective: ["efficient"],
    adverb: ["efficiently"],
    verb: [],
  },
];
async function upload(
  page: Page,
  rows: unknown = data,
  name = "families.json",
) {
  await expect(page.getByLabel("Nhập JSON hoặc CSV")).toBeEnabled();
  await page.getByLabel("Nhập JSON hoặc CSV").setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(rows)),
  });
  await expect(
    page.getByRole("heading", { name: "Xem trước dữ liệu nhập", exact: true }),
  ).toBeVisible();
}
async function fillCorrect(page: Page, wrong = false) {
  if (await page.getByRole("heading", { name: /^Sự phân tích ·/ }).count()) {
    await page
      .getByLabel("Noun", { exact: true })
      .fill(wrong ? "analysys" : "  ANALYSIS  ");
    await page.getByLabel("Adjective", { exact: true }).fill("analytic");
    await page.getByLabel("Adverb", { exact: true }).fill("analytically");
    await expect(page.getByLabel("Verb", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Sự phân tích · analyse / analyze",
        exact: true,
      }),
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole("heading", { name: "Hiệu suất · —", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Verb", { exact: true })).toHaveCount(0);
    await page.getByLabel("Noun", { exact: true }).fill("efficiency");
    await page.getByLabel("Adjective", { exact: true }).fill("efficient");
    await page.getByLabel("Adverb", { exact: true }).fill("efficiently");
  }
}
test("imports only on confirmation, handles duplicates and persists edited/deleted library", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/**", (route) => {
    calls++;
    void route.abort();
  });
  await page.goto("/word-families");
  await expect(
    page.getByText(
      "Thư viện trống. Nhập file của bạn hoặc thêm word family đầu tiên.",
      { exact: true },
    ),
  ).toBeVisible();
  await upload(page, [...data, data[0]]);
  await expect(
    page.getByText("2 mục mới · 1 lượt ghi đè · 0 dòng lỗi.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Word Library", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Xác nhận nhập", exact: true })
    .click();
  const table = page.getByRole("table", { name: "Word Library", exact: true });
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table.getByText("—", { exact: true })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("word-library.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(table.getByRole("row")).toHaveCount(3);
  await page.getByLabel("Tìm từ hoặc nghĩa tiếng Việt").fill("ANALYZE");
  await expect(table.getByRole("row")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Sửa Sự phân tích", exact: true })
    .click();
  await page
    .getByLabel("Nghĩa tiếng Việt", { exact: true })
    .fill("Phân tích mới");
  await page
    .getByRole("button", { name: "Lưu word family", exact: true })
    .click();
  await expect(table.getByText("Phân tích mới", { exact: true })).toBeVisible();
  await page.getByLabel("Tìm từ hoặc nghĩa tiếng Việt").fill("");
  await page
    .getByRole("button", { name: "Xóa Hiệu suất", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Xác nhận xóa", exact: true }).click();
  await expect(table.getByRole("row")).toHaveCount(2);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất JSON", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("word-families.json");
  await upload(page, [{ meaning_vi: "Sai", noun: "not an array" }]);
  await expect(
    page.getByRole("button", { name: "Xác nhận nhập", exact: true }),
  ).toBeDisabled();
  expect(calls).toBe(0);
});
test("CSV preview, local grading, missing forms, persisted drafts, results and retry incorrect words", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/**", (route) => {
    calls++;
    void route.abort();
  });
  await page.goto("/word-families");
  const csv =
    "meaning_vi,noun,adjective,adverb,verb\r\nSự phân tích,analysis,analytical|analytic,analytically,analyse|analyze\r\nHiệu suất,efficiency,efficient,efficiently,";
  await expect(page.getByLabel("Nhập JSON hoặc CSV")).toBeEnabled();
  await page.getByLabel("Nhập JSON hoặc CSV").setInputFiles({
    name: "families.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page
    .getByRole("button", { name: "Xác nhận nhập", exact: true })
    .click();
  await expect(
    page.getByText("2 word families ·", { exact: false }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Practice", exact: true }).click();
  await page.getByLabel("Số câu", { exact: true }).selectOption("50");
  await page
    .getByRole("button", { name: "Bắt đầu luyện", exact: true })
    .click();
  await expect(
    page.getByText("Bạn chọn 50 câu nhưng chỉ có 2", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Đáp án chấp nhận:", { exact: false }),
  ).toHaveCount(0);
  await expect(page.getByText("analysis", { exact: true })).not.toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("word-family-question.png"),
    fullPage: true,
  });
  await fillCorrect(page, true);
  const draft = await page.getByLabel("Noun", { exact: true }).inputValue();
  await page.getByRole("tab", { name: "Word Library", exact: true }).click();
  await page.getByRole("tab", { name: "Practice", exact: true }).click();
  await expect(page.getByLabel("Noun", { exact: true })).toHaveValue(draft);
  await page.reload();
  await page.getByRole("tab", { name: "Practice", exact: true }).click();
  await expect(page.getByLabel("Noun", { exact: true })).toHaveValue(draft);
  await page
    .getByRole("button", { name: "Check Answers", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Next Question", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Next Question", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Câu 2/2", exact: true }),
  ).toBeVisible();
  await fillCorrect(page, true);
  await page
    .getByRole("button", { name: "Check Answers", exact: true })
    .click();
  await page.getByRole("button", { name: "Xem kết quả", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Kết quả Word Families", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("5/6 điểm", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.getByText("analysys", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Retry Incorrect Words", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Câu 1/1", exact: true }),
  ).toBeVisible();
  await fillCorrect(page);
  await page.getByLabel("Noun", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "Xem kết quả", exact: true }).click();
  await expect(
    page.getByText("3/3 điểm", { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Về thiết lập", exact: true }).click();
  await page.getByLabel("Nguồn luyện").selectOption("incorrect");
  await expect(
    page.getByRole("button", { name: "Bắt đầu luyện", exact: true }),
  ).toBeDisabled();
  expect(calls).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("word-families.png"),
    fullPage: true,
  });
});

test("overwrites matching import rows only after confirmation and retains selections", async ({ page }) => {
  await page.goto("/word-families");
  await upload(page);
  await page.getByRole("button", { name: "Xác nhận nhập", exact: true }).click();
  const table = page.getByRole("table", { name: "Word Library", exact: true });
  const row = table.getByRole("row").filter({ hasText: "Sự phân tích" });
  await row.getByRole("checkbox").check();
  await upload(page, [{ ...data[0], noun: ["replacement"], verb: [] }]);
  await expect(page.getByText("0 mục mới · 1 lượt ghi đè · 0 dòng lỗi.", { exact: false })).toBeVisible();
  await expect(row.getByText("analysis", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Xác nhận nhập", exact: true }).click();
  await expect(row.getByText("replacement", { exact: true })).toBeVisible();
  await expect(row.getByRole("checkbox")).toBeChecked();
  await expect(table.getByRole("row")).toHaveCount(3);
  await page.reload();
  await expect(row.getByText("replacement", { exact: true })).toBeVisible();
  await expect(row.getByRole("checkbox")).toBeChecked();
  await page.screenshot({ path: test.info().outputPath("import-updated.png"), fullPage: true });
});
