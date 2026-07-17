// 一時ローカル検証用（コミットしない）: 並行セッションが 3100 番を使用しているため
// 専用ポート 3135 で分離して実行する。内容は playwright.config.ts と同一。
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3135",
    locale: "ja-JP",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx serve out -l 3135",
    url: "http://localhost:3135",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
