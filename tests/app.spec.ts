import { test, expect } from "@playwright/test";
test("four-skill workspace removes theory, lessons and gates and keeps mobile layouts usable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Hôm nay bạn muốn luyện gì?" }),
  ).toBeVisible();
  await expect(page.locator(".home-skill-link")).toHaveCount(4);
  await expect(
    page.getByRole("link", {
      name: /Learning Path|Grammar Lessons|Start learning/,
    }),
  ).toHaveCount(0);
  for (const route of [
    "/listening",
    "/reading",
    "/writing",
    "/grammar",
    "/history",
    "/settings",
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/learn/sentence-foundations-01");
  await expect(page).toHaveURL(/\/grammar$/);
  await expect(
    page.getByRole("button", { name: "Generate Practice", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".practice-theory,.practice-consent")).toHaveCount(
    0,
  );
  expect(errors).toEqual([]);
  await page.goto("/");
  await page.screenshot({
    path: `test-results/practice-home-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("setup selects and topic inputs share component height and a neutral theme", async ({
  page,
}) => {
  for (const skill of ["listening", "reading", "writing"]) {
    await page.goto(`/${skill}`);
    const level = page.getByLabel("Độ khó", { exact: true });
    const topic = page.getByLabel("Chủ đề", { exact: true });
    await expect(topic).toBeVisible();
    const selectBox = await level.boundingBox();
    const inputBox = await topic.boundingBox();
    expect(selectBox).not.toBeNull();
    expect(inputBox).not.toBeNull();
    expect(Math.abs(selectBox!.height - inputBox!.height)).toBeLessThanOrEqual(
      1,
    );
    if (skill !== "writing" && page.viewportSize()!.width > 600)
      expect(Math.abs(selectBox!.y - inputBox!.y)).toBeLessThanOrEqual(1);
    const button = page.getByRole("button", {
      name: "Tạo bài bằng AI",
      exact: true,
    });
    const color = await button.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    const channels = color.match(/\d+/g)!.slice(0, 3).map(Number);
    expect(channels[0]).toBe(channels[1]);
    expect(channels[1]).toBe(channels[2]);
    await expect(level).toBeEnabled();
    await topic.fill("Work and travel");
    await expect(topic).toHaveValue("Work and travel");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/neutral-${skill}-${test.info().project.name}.png`,
      fullPage: true,
    });
  }
});

test("Margin shell supports sidebar collapse and an accessible mobile sheet", async ({
  page,
}) => {
  await page.goto("/");
  const toggle = page.getByRole("button", {
    name: "Toggle navigation",
    exact: true,
  });
  const family = await page
    .locator("body")
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).toContain("Inter");
  if (page.viewportSize()!.width < 768) {
    await toggle.click();
    const sheet = page.getByRole("dialog", { name: "Sidebar", exact: true });
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () => !!document.activeElement?.closest('[role="dialog"]'),
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await toggle.click();
    await sheet.getByRole("link", { name: "Nghe", exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "Luyện nghe", exact: true }),
    ).toBeVisible();
  } else {
    const rail = page.locator('[data-slot="sidebar"][data-state]');
    await expect(rail).toHaveAttribute("data-state", "expanded");
    await expect(
      page.locator('[data-slot="sidebar-menu-button"][data-active]'),
    ).toHaveCount(1);
    await page
      .getByRole("button", { name: "Thu gọn sidebar", exact: true })
      .click();
    await expect(rail).toHaveAttribute("data-state", "collapsed");
    await toggle.click();
    await expect(rail).toHaveAttribute("data-state", "expanded");
    await expect(rail).toHaveCSS("width", "256px");
  }
  expect(
    await page
      .locator(".workspace-scroll")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/margin-shell-${test.info().project.name}.png`,
    fullPage: true,
  });
});
