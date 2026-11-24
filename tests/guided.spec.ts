import { test, expect } from "@playwright/test";
test("G01 supports persisted practice, original answer keys and letter writing", async ({
  page,
}) => {
  await page.goto("/grammar/lessons/present-tenses");
  await expect(
    page.getByRole("heading", {
      name: "Thói quen và thay đổi hiện tại",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Chọn câu G01")).toBeVisible();
  await page.locator("input[type=radio]").first().check();
  await page
    .getByRole("button", { name: "Chấm câu trả lời", exact: true })
    .click();
  await expect(
    page.getByText("Đã luyện 1/25 câu", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Đã luyện 1/25 câu", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Làm bài thư Task 1" }).click();
  await page
    .getByLabel("Câu trả lời G01")
    .fill("I normally work in the office.");
  await expect(page.getByText("6 từ", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByLabel("Chọn câu G01").selectOption("24");
  await expect(page.getByLabel("Câu trả lời G01")).toHaveValue(
    "I normally work in the office.",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("g01.png"),
    fullPage: true,
  });
});
