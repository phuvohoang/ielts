import { test, expect } from "@playwright/test";
test("Pages serves the four-skill workspace and redirects old theory deep links", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/ielts/");
  await expect(
    page.getByRole("heading", { name: "Hôm nay bạn muốn luyện gì?" }),
  ).toBeVisible();
  await expect(page.locator(".home-skill-link")).toHaveCount(4);
  await page.goto("/ielts/#/learn/sentence-foundations-01");
  await expect(page).toHaveURL(/#\/grammar$/);
  await expect(
    page.getByRole("button", { name: "Generate Practice", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "IELTS Grammar Practice", exact: true }),
  ).toBeVisible();
  for (const skill of ["listening", "reading", "writing"]) {
    await page.goto(`/ielts/#/${skill}`);
    await expect(
      page.getByRole("button", { name: "Tạo bài bằng AI", exact: true }),
    ).toBeEnabled();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Tạo bài luyện", exact: true }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});
