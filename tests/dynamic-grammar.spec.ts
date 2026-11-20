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
          ieltsTopic: input.ieltsTopic,
          subtopics: input.subtopics,
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
      name: "Configure Practice",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "Word Formation & Word Families",
      exact: true,
    })
    .check();
  await page.getByRole("radio", { name: "10 questions", exact: true }).check();
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
    page.getByRole("checkbox", { name: "Tenses", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("checkbox", {
      name: "Word Formation & Word Families",
      exact: true,
    }),
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
  await page
    .getByRole("button", { name: "Tiếp tục làm bài", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Reference answer", exact: true }),
  ).toBeVisible();
  await expect(card(page).getByRole("radio").first()).toBeDisabled();
  await page.reload();
  await expect(
    page.getByText("Score 10/10 graded.", { exact: true }),
  ).toBeVisible();
});
test("loads all 50 questions before opening practice, retries a failed batch, and keeps earlier questions stable", async ({
  page,
}) => {
  const mock = await mockAPI(page, { failBatch: 1, delayedBatch: 2 });
  await start(page);
  await page.getByRole("radio", { name: "50 questions", exact: true }).check();
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

test("20-question practice waits for the complete set, opens the answer field and grades only after submission", async ({
  page,
}) => {
  const mock = await mockAPI(page, { delayedBatch: 1 });
  await start(page);
  await page.getByRole("radio", { name: "20 questions", exact: true }).check();
  await page
    .getByRole("button", { name: "Generate Practice", exact: true })
    .click();
  await expect(
    page.getByText("Đã tạo 10/20 câu.", { exact: false }),
  ).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  expect(mock.gradeCalls).toBe(0);
  await expect(card(page)).toBeVisible();
  await expect(
    page.getByText("0/20 answered · 20 ready", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("chưa đạt kiểm định", { exact: false }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Your answer", { exact: true })).toBeFocused();
  expect(mock.generationCalls).toBe(2);
  expect(mock.gradeCalls).toBe(0);
  const initialId = await card(page).getAttribute("data-exercise-id");
  const first = [...mock.sessions.values()][0].questions[0];
  await page
    .getByLabel("Your answer", { exact: true })
    .fill(first.referenceAnswers[0]);
  await page.getByRole("button", { name: "Check Answer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Correct · 1/1", exact: true }),
  ).toBeVisible();
  expect(mock.gradeCalls).toBe(1);
  await page.reload();
  await expect(card(page)).toHaveAttribute("data-exercise-id", initialId!);
  await expect(
    page.getByRole("heading", { name: "Correct · 1/1", exact: true }),
  ).toBeVisible();
  expect(mock.generationCalls).toBe(2);
  await page.screenshot({
    path: `test-results/full-set-${test.info().project.name}.png`,
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

test("renders the exact underlined source phrase and preserves it after reload", async ({
  page,
}) => {
  const mock = await mockAPI(page);
  await page.route("**/api/grammar/generate", async (route, request) => {
    const body = request.postDataJSON();
    if (body.sessionId) {
      for (const q of mock.sessions.get(body.sessionId)!.questions) {
        q.questionText = "The plan offers benefits to the economy.";
        q.instruction =
          "Rewrite the sentence, replacing the underlined part with an adjective phrase.";
        q.underlinedText = "benefits to the economy";
        q.rootWord = "economy";
      }
    }
    await route.fallback();
  });
  await start(page);
  await page
    .getByRole("button", { name: "Generate Practice", exact: true })
    .click();
  await expect(card(page).locator("u")).toHaveText("benefits to the economy");
  await expect(card(page).getByRole("note")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Reference answer", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(card(page).locator("u")).toHaveText("benefits to the economy");
});

test("identifies old questions with missing underlines and allows skipping without grading", async ({
  page,
}) => {
  const mock = await mockAPI(page);
  await page.route("**/api/grammar/generate", async (route, request) => {
    const body = request.postDataJSON();
    if (body.sessionId) {
      for (const q of mock.sessions.get(body.sessionId)!.questions) {
        q.instruction = "Replace the underlined part.";
        delete q.underlinedText;
      }
    }
    await route.fallback();
  });
  await start(page);
  await page
    .getByRole("button", { name: "Generate Practice", exact: true })
    .click();
  await expect(card(page).getByRole("note")).toContainText(
    "không cung cấp vị trí",
  );
  const id = await card(page).getAttribute("data-exercise-id");
  await page
    .getByRole("button", { name: "Next Question", exact: true })
    .click();
  await expect(card(page)).not.toHaveAttribute("data-exercise-id", id!);
  expect(mock.gradeCalls).toBe(0);
});

test("last question hides Next and the side panel finds skipped questions without losing drafts", async ({
  page,
}) => {
  const mock = await mockAPI(page);
  await start(page);
  await page.getByRole("radio", { name: "20 questions", exact: true }).check();
  await page
    .getByLabel("Exercise type", { exact: true })
    .selectOption("word_formation");
  await page
    .getByRole("button", { name: "Generate Practice", exact: true })
    .click();
  await expect(card(page)).toBeVisible();
  const navigator = page.getByRole("complementary", {
    name: "Điều hướng câu hỏi",
  });
  for (let number = 1; number <= 15; number++) {
    await navigator
      .getByRole("button", {
        name: `Câu ${number} — Chưa trả lời`,
        exact: true,
      })
      .click();
    await page
      .getByLabel("Your answer", { exact: true })
      .fill(`draft ${number}`);
    await expect(
      navigator.getByRole("button", {
        name: `Câu ${number} — Đã trả lời`,
        exact: true,
      }),
    ).toBeVisible();
  }
  await navigator
    .getByRole("button", { name: "Câu 20 — Chưa trả lời", exact: true })
    .click();
  await page.getByLabel("Your answer", { exact: true }).fill("last draft");
  await expect(
    page.getByText("16/20 answered · 20 ready", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next Question", exact: true }),
  ).toHaveCount(0);
  await expect(
    navigator.getByRole("button", { name: "Câu 20 — Đã trả lời", exact: true }),
  ).toHaveAttribute("aria-current", "step");
  for (let number = 16; number <= 19; number++)
    await expect(
      navigator.getByRole("button", {
        name: `Câu ${number} — Chưa trả lời`,
        exact: true,
      }),
    ).toBeVisible();
  await navigator
    .getByRole("button", { name: "Câu chưa làm tiếp theo", exact: true })
    .click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Next Question", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    navigator.getByRole("button", {
      name: "Câu 16 — Chưa trả lời",
      exact: true,
    }),
  ).toHaveAttribute("aria-current", "step");
  await navigator
    .getByRole("button", { name: "Câu 20 — Đã trả lời", exact: true })
    .click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    "last draft",
  );
  await expect(
    page.getByRole("button", { name: "Next Question", exact: true }),
  ).toHaveCount(0);
  expect(mock.gradeCalls).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/question-panel-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("defaults and multi-select generate only selected categories with Education context and preserve configuration", async ({
  page,
}) => {
  const mock = await mockAPI(page);
  await page.goto("/grammar");
  await expect(
    page.getByRole("checkbox", { name: "All Grammar Types", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "20 questions", exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("IELTS Topic", { exact: true })).toHaveValue(
    "all",
  );
  await expect(page.getByLabel("Difficulty", { exact: true })).toHaveValue(
    "B2",
  );
  await expect(page.getByLabel("Exercise type", { exact: true })).toHaveValue(
    "mixed",
  );
  await page.getByRole("checkbox", { name: "Tenses", exact: true }).check();
  await page
    .getByRole("checkbox", { name: "Conditionals", exact: true })
    .check();
  await expect(
    page.getByRole("checkbox", { name: "All Grammar Types", exact: true }),
  ).not.toBeChecked();
  await page
    .getByLabel("IELTS Topic", { exact: true })
    .selectOption("education");
  await page
    .getByRole("button", { name: "Generate Practice", exact: true })
    .click();
  await expect(card(page)).toBeVisible();
  const s = [...mock.sessions.values()][0];
  expect(s.settings.topics).toEqual(["verb-tenses", "conditionals"]);
  expect(new Set(s.questions.map((q) => q.topicId))).toEqual(
    new Set(["verb-tenses", "conditionals"]),
  );
  expect(s.questions.every((q) => q.ieltsTopic === "education")).toBe(true);
  expect(
    new Set(s.questions.map((q) => q.exerciseType)).size,
  ).toBeGreaterThanOrEqual(4);
  await expect(card(page).getByText(/Education/)).toBeVisible();
  await page
    .getByRole("button", { name: "Tạo bài luyện mới", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove Conditionals", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Conditionals", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("checkbox", { name: "All Grammar Types", exact: true })
    .check();
  await expect(
    page.getByRole("checkbox", { name: "Tenses", exact: true }),
  ).not.toBeChecked();
});

test("reordering tokens and typed draft survive direct navigation and refresh", async ({
  page,
}) => {
  await mockAPI(page);
  await page.goto("/grammar");
  await page.getByRole("radio", { name: "10 questions", exact: true }).check();
  await page
    .getByLabel("Exercise type", { exact: true })
    .selectOption("sentence_reordering");
  await page
    .getByRole("button", { name: "Generate Practice", exact: true })
    .click();
  await expect(
    page.getByLabel("Words to arrange", { exact: true }),
  ).toBeVisible();
  const token = page
    .getByLabel("Words to arrange", { exact: true })
    .getByRole("button")
    .first();
  const text = await token.innerText();
  await token.click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    text,
  );
  await page
    .getByRole("button", { name: "Next Question", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Previous Question", exact: true })
    .click();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    text,
  );
  await page.reload();
  await expect(page.getByLabel("Your answer", { exact: true })).toHaveValue(
    text,
  );
});

test("results aggregate category scores and retry only incorrect or unanswered questions while retaining earlier rounds", async ({
  page,
}) => {
  const mock = await mockAPI(page);
  await start(page);
  await page
    .getByLabel("Exercise type", { exact: true })
    .selectOption("word_formation");
  await page
    .getByRole("button", { name: "Generate Practice", exact: true })
    .click();
  await expect(card(page)).toBeVisible();
  await page
    .getByLabel("Your answer", { exact: true })
    .fill("valid alternative");
  await page.getByRole("button", { name: "Check Answer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Correct · 1/1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View Results", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tiếp tục làm bài", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/reui-results-${test.info().project.name}.png`,
    fullPage: true,
  });
  await expect(
    page.getByRole("heading", { name: "Practice Results", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Performance by grammar category",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("1/1 điểm · 100%", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry Incorrect Questions (9)", exact: true })
    .click();
  const navigator = page.getByRole("complementary", {
    name: "Điều hướng câu hỏi",
  });
  await expect(
    navigator
      .getByRole("navigation", { name: "Chọn câu hỏi" })
      .getByRole("button"),
  ).toHaveCount(9);
  await expect(
    navigator.getByRole("button", { name: "Câu 1 — Đã trả lời", exact: true }),
  ).toHaveCount(0);
  await expect(
    navigator.getByRole("button", {
      name: "Câu 2 — Chưa trả lời",
      exact: true,
    }),
  ).toHaveAttribute("aria-current", "step");
  await page.reload();
  await expect(
    navigator
      .getByRole("navigation", { name: "Chọn câu hỏi" })
      .getByRole("button"),
  ).toHaveCount(9);
  await page.getByRole("button", { name: "View Results", exact: true }).click();
  await expect(
    page.getByText("Các lượt làm trước (1)", { exact: true }),
  ).toBeVisible();
  expect(mock.gradeCalls).toBe(1);
});

test("CEFR selection restricts advanced categories and subtopics before generation", async ({
  page,
}) => {
  await page.goto("/grammar");
  await page.getByLabel("Difficulty", { exact: true }).selectOption("A2");
  await page.screenshot({
    path: `test-results/reui-configuration-${test.info().project.name}.png`,
    fullPage: true,
  });
  await expect(
    page.getByRole("checkbox", { name: "Inversion & Emphasis", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "Conditionals", exact: true })
    .check();
  const subtopics = page.getByLabel("Conditionals subtopic", { exact: true });
  await expect(subtopics.locator("option")).toHaveCount(2);
  await expect(subtopics.locator("option").last()).toHaveText("Zero and first");
  await page.getByLabel("Difficulty", { exact: true }).selectOption("C1");
  await expect(
    page.getByRole("checkbox", { name: "Inversion & Emphasis", exact: true }),
  ).toBeEnabled();
  await expect(subtopics.locator("option")).toHaveCount(5);
});
