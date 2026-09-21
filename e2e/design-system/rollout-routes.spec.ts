import { expect, test } from "@playwright/test";
import { themes } from "../../apps/frontend/src/themes/generated/registry";
import { mockRolloutRoutes } from "./rollout-route-helpers";

for (const theme of themes)
  for (const mode of ["light", "dark"])
    for (const width of [390, 1440]) {
      test(`${theme.id} ${mode} ${width} actual application routes`, async ({ page }, testInfo) => {
        test.setTimeout(90_000);
        await page.setViewportSize({ width, height: 1000 });
        const { unexpected } = await mockRolloutRoutes(page, theme.id, mode);
        const errors: string[] = [];
        page.on("pageerror", (error) => {
          errors.push(error.message);
          console.error(error.message);
        });
        for (const path of [
          "/dashboard",
          "/holdings",
          "/activities",
          "/settings/appearance",
          "/spending/insights",
          "/assistant",
        ]) {
          await page.goto(path);
          await expect(page.locator("html")).toHaveAttribute("data-theme", theme.id);
          await expect(page).toHaveURL(new RegExp(`${path}$`));
          const main = page.locator("main").first();
          await expect(main).toBeVisible();
          const content =
            path === "/settings/appearance"
              ? "Appearance mode"
              : path === "/spending/insights"
                ? "Spending plan"
                : path === "/assistant"
                  ? "synthetic-model"
                  : "ACME";
          await expect(
            main.getByText(content, { exact: true }).filter({ visible: true }).first(),
          ).toBeVisible();
          await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
          await expect(page.locator("html")).toHaveClass(new RegExp(mode));
          if (path === "/assistant") {
            const composer = main.locator("textarea");
            await expect(composer).toBeVisible();
            await composer.fill("Explain my synthetic portfolio allocation.");
            await expect(composer).toHaveValue("Explain my synthetic portfolio allocation.");
          }
          if (path === "/dashboard") {
            await expect(main.locator(".recharts-area-curve").first()).toBeVisible();
            await expect(main.locator(".animate-pulse")).toHaveCount(0);
            // Recharts uses a 300ms JavaScript clip animation, outside screenshot CSS animation control.
            await page.waitForTimeout(350);
          }
          await page.evaluate(() => document.fonts.ready);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await page.screenshot({
            path: testInfo.outputPath(`${path.replaceAll("/", "-")}.png`),
            fullPage: true,
            animations: "disabled",
          });
        }
        expect([...new Set(unexpected)]).toEqual([]);
        expect(errors).toEqual([]);
      });
    }
