import { test, expect, type Page } from "@playwright/test";
const words = [
  {
    meaning_vi: "Thành công",
    noun: ["success"],
    adjective: ["successful"],
    adverb: ["successfully"],
    verb: ["succeed"],
  },
  {
    meaning_vi: "Cẩn thận",
    noun: ["care"],
    adjective: ["careful"],
    adverb: ["carefully"],
    verb: [],
  },
  {
    meaning_vi: "Chỉ danh từ",
    noun: ["equipment"],
    adjective: [],
    adverb: [],
    verb: [],
  },
];
async function setup(page: Page) {
  await page.goto("/word-families");
  await page.getByLabel("Nhập JSON hoặc CSV").setInputFiles({
    name: "context.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(words)),
  });
  await page
    .getByRole("button", { name: "Xác nhận nhập", exact: true })
    .click();
  await page.getByRole("tab", { name: "Practice", exact: true }).click();
  await page
    .getByLabel("Loại bài tập", { exact: true })
    .selectOption("context");
  await expect(page.getByLabel("Nguồn từ ngữ cảnh")).toHaveValue("selected");
  await expect(
    page.getByRole("button", { name: "Tạo bài ngữ cảnh", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Mở Word Library", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Select Thành công", exact: true })
    .check();
  await expect(
    page.getByRole("button", {
      name: "Practice selected words (1)",
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Practice selected words (1)", exact: true })
    .click();
  await expect(page.getByLabel("Loại bài tập", { exact: true })).toHaveValue(
    "context",
  );
  await page.getByLabel("Số câu ngữ cảnh").selectOption("5");
  await page.getByLabel("Từ loại mục tiêu").selectOption("adverb");
}
test("context selected-only generation, no early keys, keyboard grading, resume, results, retry and cache", async ({
  page,
}) => {
  let calls = 0,
    serial = 0;
  await page.route("**/api/**", async (route) => {
    expect(route.request().url()).toContain("/word-families/context");
    calls++;
    const input = route.request().postDataJSON();
    expect(input.tasks).toHaveLength(5);
    expect(
      input.tasks.every(
        (t: { family: { data: { meaning_vi: string } }; target_pos: string }) =>
          t.family.data.meaning_vi === "Thành công" &&
          t.target_pos === "adverb",
      ),
    ).toBe(true);
    await route.fulfill({
      json: {
        questions: input.tasks.map(
          (t: {
            family: { id: string };
            options: string[];
            correct_answer: string;
            target_pos: string;
          }) => ({
            word_family_id: t.family.id,
            sentence: `The company has _____ completed project ${++serial}.`,
            options: t.options,
            correct_answer: t.correct_answer,
            target_pos: t.target_pos,
            explanation_vi:
              "Cần trạng từ bổ nghĩa cho động từ completed, diễn tả cách công ty hoàn thành dự án.",
            translation_vi: "Công ty đã hoàn thành dự án thành công.",
          }),
        ),
      },
    });
  });
  await setup(page);
  await page
    .getByRole("button", { name: "Tạo bài ngữ cảnh", exact: true })
    .click();
  const panel = page.getByRole("heading", {
    name: /Word Formation in Context · Câu/,
  });
  await expect(panel).toHaveText("Word Formation in Context · Câu 1/5");
  await expect(page.getByText(/^Đáp án:/)).toHaveCount(0);
  await expect(page.getByText(/^Từ loại:/)).toHaveCount(0);
  const options = page.getByRole("button", { name: /^Lựa chọn \d:/ });
  await expect(options).toHaveCount(4);
  const wrong = page.getByRole("button", { name: /^Lựa chọn \d: success$/ });
  const wrongIndex = Number(
    (await wrong.getAttribute("aria-label"))!.match(/\d/)![0],
  );
  await options.first().focus();
  await page.keyboard.press(String(wrongIndex));
  await expect(page.getByText("Chưa đúng", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Đáp án: successfully · Từ loại: Adverb/),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Practice", exact: true }).click();
  await expect(page.getByLabel("Loại bài tập", { exact: true })).toHaveValue(
    "context",
  );
  await expect(
    page.getByText("Câu bạn chọn: success", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Next Question", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  for (let i = 1; i < 5; i++) {
    await expect(panel).toHaveText(
      `Word Formation in Context · Câu ${i + 1}/5`,
    );
    await page
      .getByRole("button", { name: /^Lựa chọn \d: successfully$/ })
      .click();
    await page
      .getByRole("button", {
        name: i === 4 ? "Xem kết quả ngữ cảnh" : "Next Question",
        exact: true,
      })
      .click();
  }
  await expect(
    page.getByRole("heading", {
      name: "Kết quả Word Formation in Context",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("4/5 điểm · 80%", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Adverb: 4/5 · 80%", { exact: true }),
  ).toBeVisible();
  expect(calls).toBe(1);
  await expect(
    page.getByRole("button", { name: "Practice Again", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("context-results.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Retry Incorrect Questions", exact: true })
    .click();
  await expect(panel).toHaveText("Word Formation in Context · Câu 1/1");
  await page
    .getByRole("button", { name: /^Lựa chọn \d: successfully$/ })
    .click();
  await page
    .getByRole("button", { name: "Xem kết quả ngữ cảnh", exact: true })
    .click();
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Về thiết lập", exact: true }).click();
  await page
    .getByRole("button", { name: "Tạo bài ngữ cảnh", exact: true })
    .click();
  await expect(panel).toHaveText("Word Formation in Context · Câu 1/5");
  expect(calls).toBe(1);
  await page.getByLabel("Loại bài tập", { exact: true }).selectOption("recall");
  await expect(
    page.getByRole("button", { name: "Bắt đầu luyện", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Bắt đầu luyện", exact: true })
    .click();
  await expect(page.getByLabel("Noun", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Verb", { exact: true })).toHaveCount(0);
});
test("invalid generated options are never displayed; retry recovers and empty selected source stays disabled", async ({
  page,
}) => {
  let invalid = true,
    calls = 0;
  await page.route("**/api/word-families/context", async (route) => {
    calls++;
    const { tasks } = route.request().postDataJSON();
    await route.fulfill({
      json: {
        questions: tasks.map(
          (
            t: {
              family: { id: string };
              options: string[];
              correct_answer: string;
              target_pos: string;
            },
            i: number,
          ) => ({
            word_family_id: t.family.id,
            sentence: `The company has _____ completed report ${i + 1}.`,
            options: invalid ? ["invented", "bad"] : t.options,
            correct_answer: t.correct_answer,
            target_pos: t.target_pos,
            explanation_vi:
              "Cần trạng từ bổ nghĩa cho completed để diễn tả cách hoàn thành hành động.",
            translation_vi: "Công ty đã hoàn thành bản báo cáo thành công.",
          }),
        ),
      },
    });
  });
  await setup(page);
  await page
    .getByRole("button", { name: "Tạo bài ngữ cảnh", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("không khớp");
  await expect(page.getByRole("button", { name: /^Lựa chọn \d:/ })).toHaveCount(
    0,
  );
  invalid = false;
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Word Formation in Context · Câu 1/5",
      exact: true,
    }),
  ).toBeVisible();
  expect(calls).toBe(2);
});
