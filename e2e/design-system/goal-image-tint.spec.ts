import { expect, test } from "@playwright/test";
import { mockRolloutRoutes } from "./rollout-route-helpers";

for (const [theme, mode, opacity] of [
  ["terminal", "dark", "0.65"],
  ["terminal", "light", "0.15"],
  ["flexoki", "dark", "0"],
] as const) {
  test(`${theme} ${mode} goal image tint`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockRolloutRoutes(page, theme, mode);
    await page.route("**/api/v1/goals*", (route) =>
      route.fulfill({
        json: ["retirement", "education", "home"].map((goalType, i) => ({
          id: `preview-${i}`,
          goalType,
          title: goalType,
          statusLifecycle: "active",
          statusHealth: "on_track",
          priority: i,
          summaryCurrentValue: 12500,
          summaryTargetAmount: 50000,
          summaryProgress: 0.25,
          createdAt: "2026-08-18T00:00:00Z",
          updatedAt: "2026-08-18T00:00:00Z",
        })),
      }),
    );
    await page.goto("/goals");
    const tint = page.locator('[data-slot="goal-image-tint"]').first();
    await expect(tint).toHaveCSS("opacity", opacity);
    await expect(tint).toHaveCSS("pointer-events", "none");
    await expect(tint.locator("..")).toHaveCSS("isolation", "isolate");
    await page.locator('a[href="/goals/preview-0"] img').evaluate(async (img: HTMLImageElement) => {
      await img.decode();
    });
    await page.screenshot({ path: info.outputPath("goals.png") });
  });
}
