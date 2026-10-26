import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const isolatedDataDir = `test-results/e2e-data-${process.pid}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: { baseURL: externalBaseUrl ?? "http://127.0.0.1:15173", trace: "on-first-retry" },
  // 浏览器测试必须使用独立数据目录，否则“保存分类”会修改真实用户配置。
  webServer: externalBaseUrl ? undefined : { command: `cross-env TEMPO_DATA_DIR=${isolatedDataDir} npm run dev`, url: "http://127.0.0.1:15173", reuseExistingServer: false, timeout: 120_000 },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "tablet", use: { viewport: { width: 900, height: 1100 } } },
  ],
});
