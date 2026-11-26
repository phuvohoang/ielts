import { test, expect, type Page } from "@playwright/test";
async function upload(page: Page, rows: unknown) {
  await page.goto("/word-families");
  await page.getByLabel("Nhập JSON hoặc CSV").setInputFiles({
    name: "selection.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(rows)),
  });
  await page
    .getByRole("button", { name: "Xác nhận nhập", exact: true })
    .click();
}
const family = (meaning_vi: string, noun: string) => ({
  meaning_vi,
  noun: [noun],
  adjective: [],
  adverb: [],
  verb: [],
});
test("persists row/bulk selections across search, filters, pages, refresh and a new browser context", async ({
  page,
  browser,
}) => {
  let api = 0;
  await page.route("**/api/**", (r) => {
    api++;
    void r.abort();
  });
  await upload(page, [
    ...Array.from({ length: 27 }, (_, i) =>
      family(`Nhóm A ${i + 1}`, `forma${i}`),
    ),
    ...Array.from({ length: 5 }, (_, i) =>
      family(`Nhóm B ${i + 1}`, `formb${i}`),
    ),
  ]);
  const search = page.getByLabel("Tìm từ hoặc nghĩa tiếng Việt");
  await search.fill("Nhóm B 1");
  await page
    .getByRole("checkbox", { name: "Select Nhóm B 1", exact: true })
    .check();
  await expect(
    page.getByText("1 word families đã chọn", { exact: true }),
  ).toBeVisible();
  await search.fill("Nhóm A");
  const all = page.getByRole("checkbox", {
    name: "Select all filtered words",
    exact: true,
  });
  await all.check();
  await expect(
    page.getByText("28 word families đã chọn", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Trang sau", exact: true }).click();
  await expect(
    page
      .getByRole("table", { name: "Word Library", exact: true })
      .getByRole("row"),
  ).toHaveCount(3);
  await page
    .getByRole("checkbox", { name: /^Select Nhóm A / })
    .first()
    .uncheck();
  await expect(all).toHaveAttribute("aria-checked", "mixed");
  await all.check();
  await expect(
    page.getByText("28 word families đã chọn", { exact: true }),
  ).toBeVisible();
  await all.uncheck();
  await expect(
    page.getByText("1 word families đã chọn", { exact: true }),
  ).toBeVisible();
  await search.fill("");
  await page.getByLabel("Library selection filter").selectOption("selected");
  await expect(
    page
      .getByRole("table", { name: "Word Library", exact: true })
      .getByRole("row"),
  ).toHaveCount(2);
  await page.getByLabel("Library selection filter").selectOption("unselected");
  await expect(page.getByText("31 kết quả", { exact: false })).toBeVisible();
  await page.reload();
  await search.fill("Nhóm B 1");
  await expect(
    page.getByRole("checkbox", { name: "Select Nhóm B 1", exact: true }),
  ).toBeChecked();
  const state = await page.context().storageState({ indexedDB: true });
  const restarted = await browser.newContext({ storageState: state });
  try {
    const p = await restarted.newPage();
    await p.route("**/api/**", (r) => {
      api++;
      void r.abort();
    });
    await p.goto(page.url());
    await p.getByLabel("Tìm từ hoặc nghĩa tiếng Việt").fill("Nhóm B 1");
    await expect(
      p.getByRole("checkbox", { name: "Select Nhóm B 1", exact: true }),
    ).toBeChecked();
  } finally {
    await restarted.close();
  }
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Select Nhóm B 1", exact: true }),
  ).not.toBeChecked();
  expect(api).toBe(0);
});
test("navigates into selected mode, practises only chosen words, keeps choices after completion and disables empty selection", async ({
  page,
}) => {
  let api = 0;
  await page.route("**/api/**", (r) => {
    api++;
    void r.abort();
  });
  await upload(page, [
    family("Alpha", "alpha"),
    family("Beta", "beta"),
    family("Không chọn", "gamma"),
  ]);
  await page
    .getByRole("checkbox", { name: "Select Alpha", exact: true })
    .check();
  await expect(
    page.getByText("1 word families đã chọn", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Select Beta", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Practice selected words (2)", exact: true })
    .click();
  const source = page.getByLabel("Nguồn luyện");
  await expect(source).toHaveValue("selected");
  await expect(source.locator("option[value=selected]")).toHaveText(
    "Selected words (2)",
  );
  await expect(source.locator("option[value=all]")).toHaveText("All words (3)");
  await page.getByLabel("Số câu", { exact: true }).selectOption("50");
  await page
    .getByRole("button", { name: "Bắt đầu luyện", exact: true })
    .click();
  const seen: string[] = [];
  for (let i = 1; i <= 2; i++) {
    await expect(
      page.getByRole("heading", { name: `Câu ${i}/2`, exact: true }),
    ).toBeVisible();
    const prompt = (await page.locator("h3").first().innerText()).split(
      " · ",
    )[0];
    expect(["Alpha", "Beta"]).toContain(prompt);
    seen.push(prompt);
    await page.getByLabel("Noun", { exact: true }).fill(prompt.toLowerCase());
    await page
      .getByRole("button", { name: "Check Answers", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: i === 2 ? "Xem kết quả" : "Next Question",
        exact: true,
      })
      .click();
  }
  expect(new Set(seen).size).toBe(2);
  await expect(
    page.getByRole("heading", { name: "Kết quả Word Families", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Word Library", exact: true }).click();
  await expect(
    page.getByText("2 word families đã chọn", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sửa Alpha", exact: true }).click();
  await page.getByLabel("Nghĩa tiếng Việt", { exact: true }).fill("Alpha mới");
  await page
    .getByRole("button", { name: "Lưu word family", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Select Alpha mới", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Xóa Alpha mới", exact: true })
    .click();
  await page.getByRole("button", { name: "Xác nhận xóa", exact: true }).click();
  await expect(
    page.getByText("1 word families đã chọn", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await page.getByRole("tab", { name: "Practice", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Practice Again", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Về thiết lập", exact: true }).click();
  await expect(source).toHaveValue("selected");
  await expect(
    page.getByText("Bạn chọn 50 câu", { exact: false }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bắt đầu luyện", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Chưa chọn word family nào.", { exact: false }),
  ).toBeVisible();
  expect(api).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("selected-mode.png"),
    fullPage: true,
  });
});
