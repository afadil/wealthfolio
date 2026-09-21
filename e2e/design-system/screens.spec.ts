import { expect, test } from "@playwright/test";
import { themes } from "../../apps/frontend/src/themes/generated/registry";
for (const theme of themes)
  for (const screen of ["portfolio", "holdings", "activity"])
    for (const mode of ["light", "dark"])
      for (const width of [1280, 390]) {
        test(`${theme.id} ${screen} ${mode} ${width} composed screen`, async ({
          page,
        }, testInfo) => {
          await page.setViewportSize({ width, height: 1000 });
          await page.addInitScript(() => {
            (window as Window & { designSystemScreensMocked?: boolean }).designSystemScreensMocked =
              true;
          });
          await page.route("**/*", (route) =>
            new URL(route.request().url()).origin === "http://localhost:1434"
              ? route.continue()
              : route.abort(),
          );
          await page.route("**/api/**", (route) => {
            const path = new URL(route.request().url()).pathname;
            if (path === "/api/v1/auth/status")
              return route.fulfill({ json: { requiresPassword: false, oidcEnabled: false } });
            if (path === "/api/v1/settings")
              return route.fulfill({
                json: {
                  themeId: theme.id,
                  theme: mode,
                  font: "font-mono",
                  language: "en",
                  formattingRegion: "US",
                  baseCurrency: "USD",
                  defaultReturnMetric: "twr",
                  timezone: "UTC",
                  onboardingCompleted: true,
                  autoUpdateCheckEnabled: false,
                  menuBarVisible: true,
                  syncEnabled: false,
                },
              });
            return route.abort();
          });
          const errors: string[] = [];
          page.on("pageerror", (error) => errors.push(error.message));
          {
            await page.goto(`/e2e/design-system-screens/?screen=${screen}`);
            await expect(page.locator("[data-preview-ready]")).toBeVisible();
            await expect(
              page
                .getByText(screen === "activity" ? "Investment account" : "ACME", { exact: true })
                .first(),
            ).toBeVisible();
            await page.evaluate(() => document.fonts.ready);
            await page.screenshot({
              path: testInfo.outputPath(`${theme.id}-${screen}-${mode}-${width}.png`),
              fullPage: true,
              animations: "disabled",
            });
          }
          expect(errors).toEqual([]);
        });
      }
test("direct access is guarded without synthetic interception", async ({ page }) => {
  const apiCalls: string[] = [];
  await page.route("**/api/**", (route) => {
    apiCalls.push(route.request().url());
    return route.abort();
  });
  await page.goto("/e2e/design-system-screens/");
  await expect(
    page.getByText("Run through the mocked screen preview test; live API access is disabled."),
  ).toBeVisible();
  expect(apiCalls).toEqual([]);
});
