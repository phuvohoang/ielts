import { test, expect, type Page } from "@playwright/test";
import {
  contentFixture,
  resultFixture,
  wavFixture,
} from "../src/lib/practice/test-support";
import type { PublicExercise } from "../src/lib/practice/schema";
async function api(
  page: Page,
  options: { failGrade?: boolean; failAudio?: boolean } = {},
) {
  let generated = 0,
    graded = 0,
    audio = 0;
  const exercises = new Map<string, PublicExercise>();
  await page.route("**/api/practice/generate", async (route) => {
    generated++;
    const settings = route.request().postDataJSON();
    const c = contentFixture(settings.skill);
    if (settings.skill !== "writing") {
      c.questions[1] = {
        ...c.questions[1],
        type: "multiple_choice",
        options: [
          { id: "a", text: "Nine" },
          { id: "b", text: "Ten" },
          { id: "c", text: "Eleven" },
          { id: "d", text: "Twelve" },
        ],
        answers: ["a"],
      };
      if (settings.skill === "reading")
        c.questions[2] = {
          ...c.questions[2],
          type: "true_false_not_given",
          answers: ["TRUE"],
        };
    }
    const e: PublicExercise = {
      id: crypto.randomUUID(),
      token: "b".repeat(64),
      expiresAt: Date.now() + 86400000,
      settings,
      title: c.title,
      instructionsVi: c.instructionsVi,
      passage: c.passage,
      writingPrompt: c.writingPrompt,
      minWords:
        settings.skill === "writing"
          ? settings.task === "task1"
            ? 150
            : 250
          : 0,
      questions: c.questions.map(
        ({ answers: _a, evidence: _e, explanationVi: _x, ...q }) => q,
      ),
    };
    exercises.set(e.id, e);
    await route.fulfill({ json: e });
  });
  await page.route("**/api/practice/audio", async (route) => {
    audio++;
    if (options.failAudio && audio === 1) {
      await route.fulfill({
        status: 503,
        json: { error: "Chưa tạo được audio. Hãy thử lại." },
      });
      return;
    }
    await route.fulfill({
      contentType: "audio/wav",
      body: Buffer.from(wavFixture()),
    });
  });
  await page.route("**/api/practice/grade", async (route) => {
    graded++;
    if (options.failGrade && graded === 1) {
      await route.fulfill({
        status: 503,
        json: { error: "AI chưa chấm xong. Bài làm vẫn được giữ." },
      });
      return;
    }
    const body = route.request().postDataJSON(),
      e = exercises.get(body.id)!;
    const result = resultFixture(body.answers, e.settings.skill === "writing");
    if (e.settings.skill === "listening")
      result.transcript = contentFixture("listening").transcript;
    await route.fulfill({ json: result });
  });
  return {
    get generated() {
      return generated;
    },
    get graded() {
      return graded;
    },
    get audio() {
      return audio;
    },
  };
}
async function fillAnswers(page: Page, listening = false) {
  await page.getByLabel("Câu 1", { exact: true }).fill("9 am");
  await page.getByRole("radio", { name: "Nine", exact: true }).check();
  if (listening) await page.getByLabel("Câu 3", { exact: true }).fill("nine");
  else await page.getByLabel("Câu 3", { exact: true }).selectOption("TRUE");
  await page.getByLabel("Câu 4", { exact: true }).fill("nine");
  for (let n = 5; n <= 10; n++) await page.getByLabel(`Câu ${n}`, { exact: true }).fill("nine");
}
test("reading generates a source and mixed questions, preserves drafts, grades after submission and restores feedback", async ({
  page,
}) => {
  const m = await api(page);
  await page.goto("/reading");
  await page
    .getByRole("button", { name: "Tạo bài bằng AI", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Bài tập hiện tại" }),
  ).toBeVisible();
  await expect(
    page.getByText("Đáp án tham khảo:", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Câu 1", { exact: true }).fill("9 am");
  await page.reload();
  await expect(page.getByLabel("Câu 1", { exact: true })).toHaveValue("9 am");
  expect(m.generated).toBe(1);
  await fillAnswers(page);
  expect(m.graded).toBe(0);
  await page
    .getByRole("button", { name: "Nộp bài và chấm bằng AI", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Kết quả: 10/10", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Đáp án tham khảo:", { exact: true }),
  ).toHaveCount(10);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Kết quả: 10/10", exact: true }),
  ).toBeVisible();
  expect(m.generated).toBe(1);
  expect(m.graded).toBe(1);
  await page.screenshot({
    path: `test-results/reading-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("listening plays API audio, hides transcript until submission and reuses saved audio after reload", async ({
  page,
}) => {
  const m = await api(page, { failAudio: true });
  await page.goto("/listening");
  await page
    .getByRole("button", { name: "Tạo bài bằng AI", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Thử tải audio lại", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Thử tải audio lại", exact: true })
    .click();
  await expect(
    page.getByLabel("Audio bài nghe", { exact: true }),
  ).toBeVisible();
  await page.locator("audio").evaluate(async (el: HTMLAudioElement) => {
    await el.play();
  });
  await expect(
    page.getByText("Transcript và đối chiếu", { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByLabel("Audio bài nghe", { exact: true }),
  ).toBeVisible();
  expect(m.audio).toBe(2);
  await fillAnswers(page, true);
  await page
    .getByRole("button", { name: "Nộp bài và chấm bằng AI", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Kết quả: 10/10", exact: true }),
  ).toBeVisible();
  await page.getByText("Transcript và đối chiếu", { exact: true }).click();
  await expect(page.locator(".transcript p")).toContainText("opens at nine");
});
test("writing task selection, word count, retry and four-criterion feedback use the submitted draft", async ({
  page,
}) => {
  const m = await api(page, { failGrade: true });
  await page.goto("/writing");
  await page.getByLabel("Dạng bài", { exact: true }).selectOption("task2");
  await page
    .getByRole("button", { name: "Tạo bài bằng AI", exact: true })
    .click();
  await expect(
    page.getByText("Ít nhất 250 từ", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Viết bằng tiếng Anh", { exact: true })
    .fill(" I has attended the event and would like to suggest a change. \n");
  await page.reload();
  await expect(
    page.getByLabel("Viết bằng tiếng Anh", { exact: true }),
  ).toContainText("");
  await expect(
    page.getByLabel("Viết bằng tiếng Anh", { exact: true }),
  ).toHaveValue(/I has attended/);
  await page
    .getByRole("button", { name: "Nộp bài và chấm bằng AI", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Bài làm vẫn được giữ");
  await expect(
    page.getByLabel("Viết bằng tiếng Anh", { exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Thử chấm lại bài đã nộp", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Band ước lượng: 6.0", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".writing-scores > div")).toHaveCount(4);
  expect(m.graded).toBe(2);
  await page.goto("/history");
  await expect(
    page.getByRole("link", { name: /Community centre information/ }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/history-${test.info().project.name}.png`,
    fullPage: true,
  });
});
