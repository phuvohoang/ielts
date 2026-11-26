import { test, expect } from "@playwright/test";
test("opens the editor in view from a lower row, including reopening the same row, and saves without losing selection", async ({
  page,
}) => {
  const rows = Array.from({ length: 30 }, (_, i) => ({
    meaning_vi: `Dòng ${i}`,
    noun: [`form${i}`],
    adjective: [],
    adverb: [],
    verb: [],
  }));
  await page.goto("/word-families");
  await page
    .getByLabel("Nhập JSON hoặc CSV")
    .setInputFiles({
      name: "editor.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(rows)),
    });
  await page
    .getByRole("button", { name: "Xác nhận nhập", exact: true })
    .click();
  const table = page.getByRole("table", { name: "Word Library", exact: true });
  const edit = table.getByRole("button", { name: /^Sửa / }).last();
  const meaning = (await edit.getAttribute("aria-label"))!.replace(/^Sửa /, "");
  const selected = page.getByRole("checkbox", {
    name: `Select ${meaning}`,
    exact: true,
  });
  await selected.check();
  await expect(selected).toBeEnabled();
  await edit.scrollIntoViewIfNeeded();
  await edit.click();
  const field = page.getByLabel("Nghĩa tiếng Việt", { exact: true });
  await expect(field).toBeInViewport();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(meaning);
  // The form remains mounted when the same row is reopened. It must still scroll/focus.
  await edit.scrollIntoViewIfNeeded();
  await edit.click();
  await expect(field).toBeInViewport();
  await expect(field).toBeFocused();
  const noun = page.getByLabel("Noun", { exact: true });
  await noun.fill("corrected | alternative");
  await expect(noun).toBeFocused();
  await field.fill(`${meaning} đã sửa`);
  await page
    .getByRole("button", { name: "Lưu word family", exact: true })
    .click();
  await page
    .getByLabel("Tìm từ hoặc nghĩa tiếng Việt")
    .fill(`${meaning} đã sửa`);
  await expect(
    table.getByText("corrected / alternative", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", {
      name: `Select ${meaning} đã sửa`,
      exact: true,
    }),
  ).toBeChecked();
  await page.reload();
  await page
    .getByLabel("Tìm từ hoặc nghĩa tiếng Việt")
    .fill(`${meaning} đã sửa`);
  await expect(
    table.getByText("corrected / alternative", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Thêm word family", exact: true })
    .click();
  await expect(field).toBeInViewport();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("");
  await page.screenshot({ path: test.info().outputPath("editor-visible.png") });
});
