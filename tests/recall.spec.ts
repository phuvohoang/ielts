import { test, expect } from "@playwright/test";

test("types all four classes without early answers, saves feedback, and retries missed families", async ({
  page,
}) => {
  await page.goto("/families/recall?family=f05");
  await expect(
    page.getByRole("heading", { name: "Build the whole family." }),
  ).toBeVisible();
  await expect(page.getByText("Study forms:", { exact: false })).toHaveCount(0);
  await expect(page.getByText("successfully", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Check all four forms" }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Noun", exact: true })
    .fill("success");
  await page
    .getByRole("textbox", { name: "Adjective (adj)", exact: true })
    .fill("successful");
  await page
    .getByRole("textbox", { name: "Adverb (adv)", exact: true })
    .fill("successful");
  await page
    .getByRole("textbox", { name: "Verb", exact: true })
    .fill("succeed");
  await page.getByRole("button", { name: "Check all four forms" }).click();
  await expect(
    page.getByRole("heading", {
      name: "succeed · 3 / 4 word classes recalled",
    }),
  ).toBeVisible();
  await expect(page.locator(".recall-field.incorrect")).toContainText(
    "successfully",
  );
  await page.getByRole("button", { name: "View recall summary" }).click();
  await page.getByRole("button", { name: "Retry missed families" }).click();
  await expect(
    page.getByRole("textbox", { name: "Noun", exact: true }),
  ).toHaveValue("");
  await page.goto("/errors");
  await expect(
    page.getByRole("heading", { name: "Recall the succeed family" }),
  ).toBeVisible();
  await expect(page.getByText("Reference:", { exact: false })).toContainText(
    "adverb: successfully",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Recall the succeed family" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Practise this family" }).click();
  await expect(page).toHaveURL(/\/families\/recall\?family=f05$/);
});

test("accepts multiple forms and an explicit absent form", async ({ page }) => {
  await page.goto("/families/recall?family=f01");
  await page
    .getByRole("textbox", { name: "Noun", exact: true })
    .fill("developer, development");
  await page
    .getByRole("textbox", { name: "Adjective (adj)", exact: true })
    .fill("developing, developed");
  await page
    .getByRole("textbox", { name: "Adverb (adv)", exact: true })
    .fill("none");
  await page
    .getByRole("textbox", { name: "Verb", exact: true })
    .fill("develop");
  await page.getByRole("button", { name: "Check all four forms" }).click();
  await expect(
    page.getByRole("heading", {
      name: "develop · 4 / 4 word classes recalled",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
