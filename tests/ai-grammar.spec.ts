import { test, expect } from "@playwright/test";
import content from "../src/data/grammar-b2.json" with { type: "json" };
test("completes all 25 typed questions, hides answers, persists and resumes without deleting attempts", async ({
  page,
}) => {
  await page.goto("/lessons/01.2");
  await page.getByRole("checkbox").check();
  await expect(
    page.getByRole("heading", { name: "Reference answer", exact: true }),
  ).toHaveCount(0);
  for (const q of content) {
    await expect(page.locator("[data-exercise-id]")).toHaveAttribute(
      "data-exercise-id",
      q.id,
    );
    await page
      .getByLabel("Your answer", { exact: true })
      .fill(q.referenceAnswers[0]);
    await page
      .getByRole("button", { name: "Submit answer", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Correct · 1/1", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Grammar explanation" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Next question", exact: true })
      .click();
  }
  await expect(
    page.getByRole("heading", { name: "Session summary" }),
  ).toBeVisible();
  await expect(
    page.getByText("Score: 25/25 graded. 0 unanswered.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("checkbox").check();
  await expect(page.getByText(/Previous attempts: 25/)).toBeVisible();
  await page
    .getByRole("button", { name: "Resume unfinished questions" })
    .click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    "economic",
  );
  await page
    .getByRole("button", { name: "Retry exercise", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill("economic");
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await expect(page.getByText(/Previous attempts: 26/)).toBeVisible();
});
test("unknown alternatives never become wrong just because the AI service is unavailable", async ({
  page,
}) => {
  await page.goto("/lessons/01.2");
  await page.getByRole("checkbox").check();
  await page
    .getByLabel("Your answer", { exact: true })
    .fill("an unlisted answer");
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    "an unlisted answer",
  );
  await expect(page.getByText(/Previous attempts: 0/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Incorrect · 0/1", exact: true }),
  ).toHaveCount(0);
});
test("shows AI partial credit and accessible correction, prevents duplicate requests and retries a failed call", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/grammar/grade", async (route) => {
    calls++;
    const { submissions } = route.request().postDataJSON();
    const s = submissions[0];
    if (calls === 1) {
      await route.abort();
      return;
    }
    await route.fulfill({
      json: {
        results: [
          {
            exerciseId: s.exerciseId,
            result: {
              exerciseId: s.exerciseId,
              status: "partially_correct",
              score: 0.5,
              maxScore: 1,
              userAnswer: s.userAnswer,
              correctedAnswer: "economic",
              alternativeAnswers: [],
              feedbackVi: "Nghĩa chưa hoàn toàn phù hợp.",
              grammarRule: "economic vs economical",
              explanationVi:
                "economic mô tả nền kinh tế, economical mô tả việc tiết kiệm.",
              errorSpans: [],
              confidence: 0.95,
              needsReview: false,
            },
          },
        ],
      },
    });
  });
  await page.goto("/lessons/01.2");
  await page.getByRole("checkbox").check();
  await page.getByLabel("Your answer", { exact: true }).fill("economical");
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("button", { name: "Retry grading", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Partially correct · 0.5/1",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Answer correction")).toContainText("Removed:");
  await expect(page.getByLabel("Answer correction")).toContainText("Added:");
  await expect(
    page.getByText("Your original answer: economical", { exact: true }),
  ).toBeVisible();
  expect(calls).toBe(2);
  await expect(page.getByText(/Previous attempts: 1/)).toBeVisible();
});

test("Mixed Grammar Practice interleaves family and sentence exercises without revealing references", async ({
  page,
}) => {
  await page.goto("/lessons/01.2");
  await page
    .getByLabel("Tôi đã đọc phần lý thuyết và muốn luyện tập nâng cao.")
    .check();
  await page.getByLabel("Mixed Grammar Practice · mix all parts").check();
  await page.getByLabel("Your answer", { exact: true }).fill("economic");
  await page
    .getByRole("button", { name: "Submit answer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Correct · 1/1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Next question", exact: true })
    .click();
  await expect(page.locator("[data-exercise-id]")).toHaveAttribute(
    "data-exercise-id",
    "wf-b2-016",
  );
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue("");
  await expect(
    page.getByRole("heading", { name: "Reference answer", exact: true }),
  ).toHaveCount(0);
});
