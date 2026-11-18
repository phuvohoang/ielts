import { test, expect } from "@playwright/test";

async function begin(page: import("@playwright/test").Page, id: string) {
  await page.goto(`/practice?advanced=1&question=${id}`);
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
}
test("highlights targets without delimiters, reveals the exact Vietnamese explanation only after submission, and saves progress", async ({
  page,
}) => {
  await begin(page, "PSWF-001");
  await expect(page.locator(".practice-card mark")).toHaveText("decision");
  await expect(page.locator(".practice-card h2")).not.toContainText("[[");
  const explanation =
    "Decision gọi tên một quyết định, đứng sau tính từ sở hữu her.";
  await expect(page.getByText(explanation, { exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "noun", exact: true }).check();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByText(explanation, { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Start practice", exact: true }),
  ).toBeDisabled();
  await page.goto("/progress");
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
});
test("renders four error segments and defers different translations to review rather than rejecting them", async ({
  page,
}) => {
  await begin(page, "PSWF-121");
  await expect(page.getByRole("radio")).toHaveCount(4);
  await page.getByRole("radio", { name: "fluent.", exact: true }).check();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Well done." })).toBeVisible();
  await begin(page, "PSWF-241");
  await expect(
    page.getByText("She made an important decision.", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Your answer", { exact: true })
    .fill("She reached a decision of great importance.");
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Needs review." }),
  ).toBeVisible();
  await page.goto("/errors");
  await expect(
    page.getByText("She reached a decision of great importance.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "I verified this is correct" })
    .click();
  await expect(page.getByText("A clean slate.")).toBeVisible();
});
test("preserves duplicate tokens, accepts an alternate word order for review and schedules incorrect responses for later", async ({
  page,
}) => {
  await begin(page, "PSWF-201");
  await expect(
    page.locator(".token-list span").filter({ hasText: /^the$/ }),
  ).toHaveCount(2);
  await page
    .getByLabel("Your answer", { exact: true })
    .fill("Clearly the tutor explained the rule.");
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Needs review." }),
  ).toBeVisible();
  await begin(page, "PSWF-042");
  await page.getByLabel("Your answer", { exact: true }).fill("clear");
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Let’s learn from this." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next question" }).click();
  await expect(
    page.getByRole("button", { name: "Retry incorrect answers" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Open due review queue" }).click();
  await expect(
    page.getByRole("button", { name: "Start practice", exact: true }),
  ).toBeDisabled();
});
test("All Types and All Topics mix categories and exclude recently completed IDs on a new session", async ({
  page,
}) => {
  await page.goto("/practice?advanced=1");
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  const seen: string[] = [];
  const types = new Set<string>();
  for (let i = 0; i < 10; i++) {
    const card = page.locator(".practice-card");
    seen.push((await card.getAttribute("data-question-id"))!);
    types.add((await card.locator(".badge").innerText()).trim());
    if (await page.getByRole("radio").count())
      await page.getByRole("radio").first().check();
    else
      await page
        .getByLabel("Your answer", { exact: true })
        .fill("My answer requires correction or review.");
    await page
      .getByRole("button", { name: "Check answer", exact: true })
      .click();
    await expect(page.locator(".feedback")).toBeVisible();
    await page.getByRole("button", { name: "Next question" }).click();
  }
  expect(new Set(seen).size).toBe(10);
  expect(types.size).toBe(8);
  await page.getByRole("button", { name: "New session", exact: true }).click();
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  expect(seen).not.toContain(
    await page.locator(".practice-card").getAttribute("data-question-id"),
  );
});
