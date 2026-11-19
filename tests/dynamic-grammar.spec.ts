import { test, expect, type Page } from "@playwright/test";
import {
  makePlan,
  publicQuestion,
  type Settings,
  type PrivateQuestion,
} from "../src/lib/ai/dynamic/schema";
import { questionFixture } from "../src/lib/ai/dynamic/test-support";
interface MockSession {
  sessionId: string;
  accessToken: string;
  expiresAt: number;
  settings: Settings;
  questions: PrivateQuestion[];
  nextBatch: number;
}
async function mockAPI(
  page: Page,
  options: {
    failBatch?: number;
    failGradeOnce?: boolean;
    delayedBatch?: number;
    partialBatch?: number;
  } = {},
) {
  const sessions = new Map<string, MockSession>();
  let generationCalls = 0,
    gradeCalls = 0,
    failedBatch = false,
    failedGrade = false,
    repairEnabled = false;
  await page.route("**/api/grammar/generate", async (route) => {
    const input = route.request().postDataJSON();
    if (!input.sessionId) {
      const sessionId = crypto.randomUUID(),
        settings: Settings = {
          topics: input.topics,
          questionCount: input.questionCount,
          difficulty: input.difficulty,
          exerciseType: input.exerciseType,
          feedbackMode: input.feedbackMode,
        };
      const session = {
        sessionId,
        accessToken: "a".repeat(64),
        settings,
        expiresAt: Date.now() + 7 * 86400000,
        questions: makePlan(settings).map((item) => ({
          ...questionFixture(sessionId, item, sessions.size),
          difficulty: settings.difficulty,
        })),
        nextBatch: 0,
      };
      sessions.set(sessionId, session);
      await route.fulfill({
        json: { ...session, questions: [], complete: false },
      });
      return;
    }
    generationCalls++;
    const session = sessions.get(input.sessionId)!;
    if (input.batchIndex === options.failBatch && !failedBatch) {
      failedBatch = true;
      await route.fulfill({
        status: 503,
        json: {
          error:
            "Generation temporarily unavailable; your saved batch is intact.",
        },
      });
      return;
    }
    if (input.batchIndex === options.delayedBatch)
      await new Promise((resolve) => setTimeout(resolve, 800));
    const partial = options.partialBatch === input.batchIndex && !repairEnabled;
    if (!partial)
      session.nextBatch = Math.max(session.nextBatch, input.batchIndex + 1);
    await route.fulfill({
      json: {
        sessionId: session.sessionId,
        accessToken: session.accessToken,
        expiresAt: session.expiresAt,
        settings: session.settings,
        questions: session.questions
          .slice(input.batchIndex * 10, (input.batchIndex + 1) * 10)
          .filter((q) => !partial || q.ordinal !== input.batchIndex * 10 + 3)
          .map(publicQuestion),
        nextBatch: session.nextBatch,
        complete: session.nextBatch * 10 === session.settings.questionCount,
      },
    });
  });
  await page.route("**/api/grammar/submit-exam", (route) =>
    route.fulfill({
      json: {
        submitted: true,
        answers: route.request().postDataJSON().answers,
      },
    }),
  );
  await page.route("**/api/grammar/grade", async (route) => {
    gradeCalls++;
    if (options.failGradeOnce && !failedGrade) {
      failedGrade = true;
      await route.fulfill({
        status: 503,
        json: { error: "AI unavailable. Your answer remains unscored." },
      });
      return;
    }
    const input = route.request().postDataJSON(),
      session = sessions.get(input.sessionId)!;
    await route.fulfill({
      json: {
        results: input.submissions.map(
          (s: { exerciseId: string; userAnswer: string }) => {
            const q = session.questions.find((q) => q.id === s.exerciseId)!;
            return {
              exerciseId: q.id,
              result: {
                exerciseId: q.id,
                status: "correct",
                score: 1,
                maxScore: 1,
                userAnswer: s.userAnswer,
                correctedAnswer: q.referenceAnswers[0],
                alternativeAnswers: [],
                feedbackVi: "Đúng. Câu trả lời phù hợp với ngữ cảnh.",
                grammarRule: q.grammarRules[0],
                explanationVi: q.explanationVi,
                errorSpans: [],
                confidence: 0.98,
                needsReview: false,
              },
              reveal: {
                referenceAnswers: q.referenceAnswers,
                acceptedVariants: [],
                explanationVi: q.explanationVi,
                distractorExplanations: q.distractorExplanations,
              },
            };
          },
        ),
      },
    });
  });
  return {
    sessions,
    finishRepair() {
      repairEnabled = true;
    },
    get generationCalls() {
      return generationCalls;
    },
    get gradeCalls() {
      return gradeCalls;
    },
  };
}
async function start(page: Page) {
  await page.goto("/lessons/01.2");
  await expect(
    page.getByRole("heading", {
      name: "Build your practice session",
      exact: true,
    }),
  ).toBeVisible();
}
const card = (page: Page) => page.locator("[data-exercise-id]");
const next = (page: Page) =>
  page.getByRole("button", { name: "Next Question", exact: true });
test("creates fresh questions, persists typed drafts and grading, and preserves history across new sessions", async ({
  page,
}) => {
  const mock = await mockAPI(page);
  await start(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/dynamic-builder-${test.info().project.name}.png`,
    fullPage: true,
  });
  await expect(
    page.getByRole("checkbox", { name: /Verb Tenses/ }),
  ).toBeEnabled();
  await expect(
    page.getByRole("checkbox", { name: /Word Formation Build/ }),
  ).toBeChecked();
  await page
    .getByLabel("Exercise type", { exact: true })
    .selectOption("word_formation");
  await page
    .getByRole("button", { name: "Generate Practice", exact: true })
    .click();
  await expect(card(page)).toBeVisible();
  const firstId = await card(page).getAttribute("data-exercise-id");
  const firstSession = [...mock.sessions.values()][0];
  await expect(
    page.getByRole("heading", { name: "Reference answer", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Your answer", { exact: true }).fill("my saved draft");
  await page.reload();
  await expect(card(page)).toHaveAttribute("data-exercise-id", firstId!);
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    "my saved draft",
  );
  expect(mock.generationCalls).toBe(1);
  await page
    .getByLabel("Your answer", { exact: true })
    .fill(firstSession.questions[0].referenceAnswers[0]);
  await page.getByRole("button", { name: "Check Answer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Correct · 1/1", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Previous attempts: 1\./)).toHaveCount(1);
  await next(page).click();
  await expect(card(page)).toHaveAttribute(
    "data-exercise-id",
    firstSession.questions[1].id,
  );
  await page.reload();
  await expect(card(page)).toHaveAttribute(
    "data-exercise-id",
    firstSession.questions[1].id,
  );
  await page
    .getByRole("button", { name: "Previous Question", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Correct · 1/1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tạo bài luyện mới", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generate Practice", exact: true })
    .click();
  await expect(card(page)).not.toHaveAttribute("data-exercise-id", firstId!);
  expect(mock.sessions.size).toBe(2);
  await expect(page.getByText(/Previous attempts: 1\./)).toHaveCount(1);
});
test("collects a 10-question MCQ exam without early grading and shows explanations only after submission", async ({
  page,
}) => {
  const mock = await mockAPI(page);
  await start(page);
  await page
    .getByLabel("Exercise type", { exact: true })
    .selectOption("multiple_choice");
  await page.getByLabel("Feedback mode", { exact: true }).selectOption("exam");
  await page
    .getByRole("button", { name: "Generate Practice", exact: true })
    .click();
  for (let i = 0; i < 10; i++) {
    await expect(card(page)).toBeVisible();
    const q = [...mock.sessions.values()][0].questions[i];
    await card(page)
      .getByRole("radio", { name: q.options[0].text, exact: true })
      .check();
    await expect(
      page.getByRole("heading", { name: "Reference answer", exact: true }),
    ).toHaveCount(0);
    if (i < 9) await next(page).click();
  }
  expect(mock.gradeCalls).toBe(0);
  await page
    .getByRole("button", { name: "Submit session", exact: true })
    .click();
  await expect(
    page.getByText("Score 10/10 graded.", { exact: true }),
  ).toBeVisible();
  expect(mock.gradeCalls).toBe(2);
  await expect(
    page.getByRole("heading", { name: "Reference answer", exact: true }),
  ).toBeVisible();
  await expect(card(page).getByRole("radio").first()).toBeDisabled();
  await page.reload();
  await expect(
    page.getByText("Score 10/10 graded.", { exact: true }),
  ).toBeVisible();
});
test("loads 50 questions progressively, retries a failed batch, and keeps earlier questions stable", async ({
  page,
}) => {
  const mock = await mockAPI(page, { failBatch: 1, delayedBatch: 2 });
  await start(page);
  await page.getByLabel("Question count", { exact: true }).selectOption("50");
  await page
    .getByRole("button", { name: "Generate Practice", exact: true })
    .click();
  await expect(card(page)).toBeVisible();
  const id = await card(page).getAttribute("data-exercise-id");
  await expect(
    page.getByText("0/50 answered · 50 ready", {
      exact: true,
    }),
  ).toBeVisible();
  expect(mock.generationCalls).toBe(6);
  await expect(card(page)).toHaveAttribute("data-exercise-id", id!);
  await page.reload();
  await expect(card(page)).toHaveAttribute("data-exercise-id", id!);
  expect(mock.generationCalls).toBe(6);
});
test("a grading outage keeps the answer and score intact and supports retry", async ({
  page,
}) => {
  const mock = await mockAPI(page, { failGradeOnce: true });
  await start(page);
  await page
    .getByLabel("Exercise type", { exact: true })
    .selectOption("word_formation");
  await page
    .getByRole("button", { name: "Generate Practice", exact: true })
    .click();
  await expect(card(page)).toBeVisible();
  await page.getByLabel("Your answer", { exact: true }).fill("carefully");
  await page.getByRole("button", { name: "Check Answer", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("unscored");
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    "carefully",
  );
  await expect(
    page.getByRole("heading", { name: "Incorrect · 0/1", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Retry grading", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Correct · 1/1", exact: true }),
  ).toBeVisible();
  expect(mock.gradeCalls).toBe(2);
});

test("20-question practice opens the exercise first and keeps nine accepted questions usable while repairing one", async ({
  page,
}) => {
  const mock = await mockAPI(page, { partialBatch: 0 });
  await start(page);
  await page.getByLabel("Question count", { exact: true }).selectOption("20");
  await page
    .getByRole("button", { name: "Generate Practice", exact: true })
    .click();
  await expect(card(page)).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Build your practice session",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Kết quả bài luyện", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".practice-history")).not.toHaveAttribute("open");
  await expect(page.getByLabel("Your answer", { exact: true })).toBeFocused();
  const initialId = await card(page).getAttribute("data-exercise-id");
  const first = [...mock.sessions.values()][0].questions[0];
  await page
    .getByLabel("Your answer", { exact: true })
    .fill(first.referenceAnswers[0]);
  await page.getByRole("button", { name: "Check Answer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Correct · 1/1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("1/20 answered · 9 ready", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry Generation", exact: true }),
  ).toBeVisible();
  expect(mock.generationCalls).toBe(3); // bounded background repair, no infinite paid requests
  await page.reload();
  await expect(card(page)).toHaveAttribute("data-exercise-id", initialId!);
  await expect(
    page.getByRole("heading", { name: "Correct · 1/1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry Generation", exact: true }),
  ).toBeVisible();
  mock.finishRepair();
  await page
    .getByRole("button", { name: "Retry Generation", exact: true })
    .click();
  await expect(
    page.getByText("1/20 answered · 20 ready", { exact: true }),
  ).toBeVisible();
  await expect(card(page)).toHaveAttribute("data-exercise-id", initialId!);
  await expect(
    page.getByRole("heading", { name: "Correct · 1/1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Kết quả bài luyện", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `test-results/practice-first-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("shows a required opening before submission while keeping the complete sentence key hidden", async ({
  page,
}) => {
  const mock = await mockAPI(page);
  // The API fixture is private; only a safe partial opening becomes public.
  await page.route("**/api/grammar/generate", async (route, request) => {
    const body = request.postDataJSON();
    if (!body.sessionId) {
      await route.fallback();
      return;
    }
    const session = mock.sessions.get(body.sessionId)!;
    for (const q of session.questions) {
      q.requiredOpening = q.referenceAnswers[0]
        .split(" ")
        .slice(0, 3)
        .join(" ");
      q.instruction += " Begin with the provided words.";
    }
    await route.fallback();
  });
  await start(page);
  await page
    .getByLabel("Exercise type", { exact: true })
    .selectOption("sentence_transformation");
  await page
    .getByRole("button", { name: "Generate Practice", exact: true })
    .click();
  await expect(card(page)).toBeVisible();
  const first = [...mock.sessions.values()][0].questions[0];
  await expect(
    card(page).getByText(`Begin with: ${first.requiredOpening}`, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Reference answer", exact: true }),
  ).toHaveCount(0);
  await expect(
    card(page).getByText(first.referenceAnswers[0], { exact: true }),
  ).toHaveCount(0);
});
