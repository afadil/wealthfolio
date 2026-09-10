import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/net-worth",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4175",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm --filter frontend exec vite --host 127.0.0.1 --port 4175",
    url: "http://127.0.0.1:4175/e2e/net-worth/",
    reuseExistingServer: !process.env.CI,
  },
});
