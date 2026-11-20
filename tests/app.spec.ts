import { test, expect } from "@playwright/test";
test("four-skill workspace removes theory, lessons and gates and keeps mobile layouts usable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Hôm nay bạn muốn luyện gì?" }),
  ).toBeVisible();
  await expect(page.locator(".home-skill-link")).toHaveCount(4);
  await expect(
    page.getByRole("link", {
      name: /Learning Path|Grammar Lessons|Start learning/,
    }),
  ).toHaveCount(0);
  for (const route of [
    "/listening",
    "/reading",
    "/writing",
    "/grammar",
    "/history",
    "/settings",
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/learn/sentence-foundations-01");
  await expect(page).toHaveURL(/\/grammar$/);
  await expect(
    page.getByRole("button", { name: "Generate Practice", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".practice-theory,.practice-consent")).toHaveCount(
    0,
  );
  expect(errors).toEqual([]);
  await page.goto("/");
  await page.screenshot({
    path: `test-results/practice-home-${test.info().project.name}.png`,
    fullPage: true,
  });
});
