import { expect, test, type Page } from "@playwright/test";

test("overview renders and navigation works", async ({ page }) => {
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: /概览|Overview/ })).toBeVisible();
  await page.getByRole("link", { name: /时间轴|Timeline/ }).first().click();
  await expect(page).toHaveURL(/timeline/);
  await expect(page.getByRole("heading", { name: /^(时间轴|Timeline)$/ })).toBeVisible();
});

test("language switch persists", async ({ page }) => {
  await page.goto("/overview");
  const before = await page.locator("h1").textContent();
  await page.getByRole("button", { name: /界面语言|Interface language/ }).click();
  await expect(page.locator("h1")).not.toHaveText(before ?? "");
  const after = await page.locator("h1").textContent();
  await page.reload();
  await expect(page.locator("h1")).toHaveText(after ?? "");
});

test("manual category editor persists a draft", async ({ page }) => {
  await page.goto("/categories");
  const firstName = page.getByLabel(/中文名称|Chinese name/).first();
  await firstName.fill(`测试分类 ${Date.now()}`);
  await page.getByRole("button", { name: /^保存$|^Save$/ }).click();
  await expect(page.getByText(/已写入本地|Written to local storage/)).toBeVisible();
});


test("settings shows the stable local configuration path", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText(/配置文件位置|Configuration path/)).toBeVisible();
  await expect(page.getByText(/dashboard-config\.json/)).toBeVisible();
});

test("category breakdown opens a complete detail drawer", async ({ page }) => {
  await mockStableOverview(page);
  await page.goto("/overview");
  await page.getByRole("button", { name: /^(工作|Work)$/ }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: /^(工作|Work)$/ })).toBeVisible();
  await expect(drawer.getByText("Visual Studio Code").first()).toBeVisible();
  await expect(drawer.getByText("Architecture document 54")).toBeVisible();
  await expect(drawer.getByRole("button", { name: /显示更多|Show more/ })).toBeVisible();
  await drawer.getByRole("button", { name: /显示更多|Show more/ }).click();
  await expect(drawer.getByText("Architecture document 0")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("Overview charts remain stable", async ({ page }) => {
  await mockStableOverview(page);
  await page.goto("/overview");
  const chart = page.locator("[data-chart-root]").first();
  const originalSvg = await chart.locator("svg").elementHandle();
  expect(originalSvg).not.toBeNull();
  await page.waitForTimeout(3_500);
  const sameNode = await chart.locator("svg").evaluate((current, original) => current === original, originalSvg);
  expect(sameNode).toBe(true);
});

async function mockStableOverview(page: Page) {
  const startedAt = "2026-08-17T23:00:00.000Z";
  const workSegments = Array.from({ length: 55 }, (_, index) => ({
    id: `work-${index}`,
    start: new Date(Date.parse(startedAt) + index * 60_000).toISOString(),
    end: new Date(Date.parse(startedAt) + (index + 1) * 60_000).toISOString(),
    duration: 60,
    app: "code.exe",
    appLabel: "Visual Studio Code",
    title: `Architecture document ${index}`,
    categoryId: "work",
    categoryName: { "zh-CN": "工作", en: "Work" },
    color: "#2563eb",
    domain: "github.com",
  }));
  const communication = {
    ...workSegments[0], id: "communication-1", app: "teams.exe", appLabel: "Teams", title: "Project meeting",
    categoryId: "communication", categoryName: { "zh-CN": "沟通", en: "Communication" }, color: "#7c3aed",
  };
  const categories = [
    { key: "work", label: "工作", duration: 3_300, percent: 0.9821, color: "#2563eb" },
    { key: "communication", label: "沟通", duration: 60, percent: 0.0179, color: "#7c3aed" },
  ];

  await page.route("**/api/status", (route) => route.fulfill({ json: { connected: true, serverVersion: "test", serverHostname: "TEST", hosts: [{ host: "TEST", window: true, afk: true, stopwatch: false, web: true }], dayStart: "04:00", warnings: [], checkedAt: new Date().toISOString() } }));
  await page.route("**/api/config", (route) => route.fulfill({ json: { version: 3, revision: 0, updatedAt: new Date().toISOString(), locale: "zh-CN", activityWatchUrl: "http://127.0.0.1:5600", timezone: "Australia/Sydney", followActivityWatchDayStart: true, dayStart: "04:00", refreshSeconds: 30, selectedHost: "TEST", analytics: { contextSwitchMinimumSeconds: 5 }, categories: [] } }));
  await page.route("**/api/overview?**", (route) => route.fulfill({ json: { date: "2026-08-18", host: "TEST", window: { start: "2026-08-17T18:00:00.000Z", end: "2026-08-18T18:00:00.000Z", dayStart: "04:00", timezone: "Australia/Sydney" }, activeSeconds: 3_360, previousActiveSeconds: 3_000, contextSwitches: 1, stopwatchSeconds: 0, topApp: { key: "code.exe", label: "Visual Studio Code", duration: 3_300, percent: 0.9821 }, apps: [{ key: "code.exe", label: "Visual Studio Code", duration: 3_300, percent: 0.9821 }], categories, websites: [{ key: "github.com", label: "github.com", duration: 3_300, percent: 1 }], hours: Array.from({ length: 24 }, (_, index) => ({ index, label: `${String((index + 4) % 24).padStart(2, "0")}:00`, duration: index === 5 ? 3_360 : 0 })), recentSegments: [workSegments[54], communication], dataQuality: [], generatedAt: new Date().toISOString() } }));
  await page.route("**/api/timeline?**", (route) => route.fulfill({ json: { date: "2026-08-18", host: "TEST", window: { start: "2026-08-17T18:00:00.000Z", end: "2026-08-18T18:00:00.000Z", dayStart: "04:00", timezone: "Australia/Sydney" }, segments: [...workSegments, communication], dataQuality: [] } }));
}
