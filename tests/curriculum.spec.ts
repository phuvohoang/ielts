import { test, expect } from "@playwright/test";
import { goldQuestions, allChecks } from "../src/lib/curriculum/gold";
import { publicQuestion } from "../src/lib/curriculum/quality";
import { knowledge, unit } from "../src/lib/curriculum/catalog";
const session = () => ({
  id: crypto.randomUUID(),
  token: "b".repeat(64),
  unitId: unit.id,
  patternIds: knowledge.map((p) => p.id),
  expiresAt: Date.now() + 7 * 86400000,
  questions: goldQuestions().map((q) => publicQuestion(q, allChecks)),
});
test("verified unit, generated set, draft recovery, alternative grading and progress persist", async ({
  page,
}, info) => {
  let generated = 0;
  await page.route("**/api/curriculum/generate", (route) => {
    generated++;
    return route.fulfill({ json: session() });
  });
  await page.route("**/api/curriculum/grade", (route) => {
    const input = route.request().postDataJSON();
    const q = goldQuestions().find((q) => q.id === input.questionId)!;
    return route.fulfill({
      json: {
        questionId: q.id,
        answer: input.answer,
        status: "correct",
        confidence: 0.95,
        demonstratesPattern: true,
        feedbackVi: "Cách diễn đạt khác vẫn đúng.",
        expectedAnswer: q.expectedAnswer,
        acceptedAlternatives: q.acceptedAlternatives,
        explanationVi: q.explanationVi,
      },
    });
  });
  await page.goto("/curriculum");
  await expect(
    page.getByRole("heading", { name: "Unit 1 · Present tenses", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Sách", { exact: true })
    .selectOption("vocabulary-advanced");
  await expect(
    page.getByRole("heading", { name: "Chưa có bài đã xác minh", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mở Unit 1 Grammar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Tạo 10 câu mới với Gemini", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bài luyện đã lưu", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Our library runs a reading club every Saturday.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByLabel("Câu trả lời 7", { exact: true })
    .fill("The library offers a free reading group on Fridays.");
  await page.reload();
  await expect(page.getByLabel("Câu trả lời 7", { exact: true })).toHaveValue(
    "The library offers a free reading group on Fridays.",
  );
  const question = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Câu 7 · Viết có hướng dẫn",
        exact: true,
      }),
    });
  await question
    .getByRole("button", { name: "Chấm câu 7", exact: true })
    .click();
  await expect(
    question.getByText("Cách diễn đạt khác vẫn đúng.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/1 câu đúng · 0 cần luyện lại/)).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Cách diễn đạt khác vẫn đúng.", { exact: true }),
  ).toBeVisible();
  expect(generated).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `tmp/curriculum-${info.project.name}.png`,
    fullPage: true,
  });
});
test("generation/grade failures preserve existing drafts and offer retry", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/curriculum/generate", (route) => {
    requests++;
    return requests === 1
      ? route.fulfill({ status: 503, json: { error: "quality gate" } })
      : route.fulfill({ json: session() });
  });
  await page.route("**/api/curriculum/grade", (route) =>
    route.fulfill({ status: 503, json: { error: "offline" } }),
  );
  await page.goto("/curriculum");
  const generate = page.getByRole("button", {
    name: "Tạo 10 câu mới với Gemini",
    exact: true,
  });
  await generate.click();
  await expect(page.getByRole("alert")).toBeVisible();
  await generate.click();
  await page.getByLabel("Câu trả lời 2", { exact: true }).fill("is checking");
  const question = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Câu 2 · Điền chỗ trống",
        exact: true,
      }),
    });
  await question
    .getByRole("button", { name: "Chấm câu 2", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Câu trả lời 2", { exact: true })).toHaveValue(
    "is checking",
  );
  await expect(
    question.getByRole("button", { name: "Chấm câu 2", exact: true }),
  ).toBeEnabled();
});
