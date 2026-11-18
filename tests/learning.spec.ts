import { test, expect, type Page } from "@playwright/test";
import data from "../src/data/foundation/questions.json" with { type: "json" };
const lessonIds = [
  "sf-complete-clause",
  "sf-svo-order",
  "sf-be-complement",
  "sf-sentence-boundary",
];
async function answerCard(page: Page) {
  const card = page.locator("[data-question-id]");
  const id = await card.getAttribute("data-question-id");
  const q = data.find((q) => q.id === id)!;
  if (q.choices.length)
    await page.getByRole("radio", { name: q.answers[0], exact: true }).check();
  else await page.getByLabel("Your answer", { exact: true }).fill(q.answers[0]);
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Correct.", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Next exercise", exact: true })
    .click();
}
async function finishStage(page: Page, stage: string) {
  const count = data.filter(
    (q) =>
      q.lesson_id === stage.split(":")[0] &&
      q.learning_stage === stage.split(":")[1],
  ).length;
  for (let i = 0; i < count; i++) await answerCard(page);
}
test("default practice excludes unlearned rules and Advanced Mixed Practice is an explicit opt-in", async ({
  page,
}) => {
  await page.goto("/practice");
  await expect(
    page.getByRole("button", { name: "Start practice", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "Advanced Mixed Practice — include unlearned rules",
    })
    .check();
  await expect(
    page.getByText(
      "Unrestricted mode can include grammar you have not studied.",
      { exact: false },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await expect(page.locator(".practice-card")).toBeVisible();
  await page.goto("/learn/sf-complete-clause");
  await page
    .getByRole("button", { name: "I have studied the rule → Understand" })
    .click();
  await page
    .getByRole("button", {
      name: "I understand the examples → Guided Practice",
    })
    .click();
  await expect(page.locator(".guided-hint")).toBeVisible();
  await page.goto("/practice");
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
  await expect(page.locator(".practice-card")).toHaveAttribute(
    "data-question-id",
    /^SF1-independent-/,
  );
});
test("incorrect guided feedback identifies the exact rule and independent practice hides hints", async ({
  page,
}) => {
  await page.goto("/learn/sf-complete-clause");
  await page
    .getByRole("button", { name: "I have studied the rule → Understand" })
    .click();
  await page
    .getByRole("button", {
      name: "I understand the examples → Guided Practice",
    })
    .click();
  await expect(page.locator(".guided-hint")).toBeVisible();
  await page
    .getByRole("radio", { name: "My sister to work.", exact: true })
    .check();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Revisit the specific rule." }),
  ).toBeVisible();
  await expect(page.locator(".feedback")).toContainText("Rule: Câu hoàn chỉnh");
  await page.reload();
  await expect(page.getByRole("button", { name: /5. Apply/ })).toBeDisabled();
});
test("all four lessons complete the seven-stage flow and keep mastery after refresh", async ({
  page,
}) => {
  test.setTimeout(120000);
  let clock = new Date("2026-01-01T12:00:00Z");
  await page.clock.install({ time: clock });
  for (const id of lessonIds) {
    await page.goto(`/learn/${id}`);
    await page
      .getByRole("button", { name: "I have studied the rule → Understand" })
      .click();
    await expect(page.locator(".annotated-example")).toHaveCount(3);
    await page
      .getByRole("button", {
        name: "I understand the examples → Guided Practice",
      })
      .click();
    await finishStage(page, `${id}:guided`);
    await page
      .getByRole("button", {
        name: "Continue to Independent Practice",
        exact: true,
      })
      .click();
    await expect(page.locator(".guided-hint")).toHaveCount(0);
    await finishStage(page, `${id}:independent`);
    await page
      .getByRole("button", { name: "Continue to Apply", exact: true })
      .click();
    await finishStage(page, `${id}:apply`);
    await page
      .getByRole("button", { name: "Continue to Review", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Let memory do some work." }),
    ).toBeVisible();
    clock = new Date(clock.getTime() + 86400000 + 3600000);
    await page.clock.setSystemTime(clock);
    await page.reload();
    await finishStage(page, `${id}:review`);
    await page
      .getByRole("button", { name: "Continue to Mastery Check", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Start / resume mastery check",
        exact: true,
      })
      .click();
    for (let i = 0; i < 6; i++) await answerCard(page);
    await page
      .getByRole("button", { name: "Finish mastery check", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Lesson mastered.", exact: true }),
    ).toBeVisible();
  }
  await page.goto("/path");
  await expect(
    page.locator(".curriculum-row").filter({ hasText: "Mastered" }),
  ).toHaveCount(4);
  await page.reload();
  await expect(
    page.locator(".curriculum-row").filter({ hasText: "Mastered" }),
  ).toHaveCount(4);
});

test("a partially completed lesson resumes at the unfinished exercise", async ({
  page,
}) => {
  await page.goto("/learn/sf-complete-clause");
  await page
    .getByRole("button", { name: "I have studied the rule → Understand" })
    .click();
  await page
    .getByRole("button", {
      name: "I understand the examples → Guided Practice",
    })
    .click();
  await answerCard(page);
  await page.reload();
  await expect(page.locator("[data-question-id]")).toHaveAttribute(
    "data-question-id",
    "SF1-guided-2",
  );
  await page.goto("/practice?question=PSWF-001");
  await expect(
    page.getByRole("button", { name: "Start practice", exact: true }),
  ).toBeDisabled();
  await page.goto("/practice?advanced=1&question=SF1-mastery-1");
  await expect(
    page.getByRole("button", { name: "Start practice", exact: true }),
  ).toBeDisabled();
});
