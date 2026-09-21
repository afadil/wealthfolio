import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/design-system",
  outputDir: ".local/design-system/browser-results",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:1434", ...devices["Desktop Chrome"] },
  webServer: {
    command: "BUILD_TARGET=web pnpm --filter frontend exec vite --port 1434",
    url: "http://localhost:1434/e2e/design-system/",
    reuseExistingServer: !process.env.CI,
  },
});
