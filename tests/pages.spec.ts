import { test, expect } from "@playwright/test";

test("GitHub Pages assets, hash navigation, and refresh work under the repository path", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ielts/");
  await expect(
    page.getByRole("heading", { name: "Make room for progress." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Start learning", exact: true }).click();
  await expect(page).toHaveURL(/\/ielts\/#\/path$/);
  await expect(
    page.getByRole("heading", {
      name: "Understand first. Practise with purpose.",
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Understand first. Practise with purpose.",
    }),
  ).toBeVisible();
  await page.goto("/ielts/#/practice?advanced=1");
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await expect(page.locator(".practice-card h2")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Pages opens four-field family recall through the library link", async ({
  page,
}) => {
  await page.goto("/ielts/#/families");
  await page.getByRole("link", { name: "Practise word-family recall" }).click();
  await expect(page).toHaveURL(/\/ielts\/#\/families\/recall$/);
  await page.getByRole("button", { name: "Start word-family recall" }).click();
  await expect(page.getByRole("textbox")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Check all four forms" }),
  ).toBeDisabled();
});
