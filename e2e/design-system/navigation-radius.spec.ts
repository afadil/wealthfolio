import { test, expect } from "@playwright/test";
import { mockRolloutRoutes } from "./rollout-route-helpers";
for (const [theme, radius] of Object.entries({
  flexoki: "9999px",
}))
  for (const width of [390, 1440]) {
    test(`${theme} dashboard navigation ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await mockRolloutRoutes(page, theme, "light");
      await page.goto("/dashboard");
      const investments = page
        .getByRole("button", { name: "Investments", exact: true })
        .filter({ visible: true });
      await expect(investments).toHaveAttribute("aria-current", "page");
      for (const surface of [
        investments,
        investments.locator(".."),
        investments.locator("div").first(),
      ])
        await expect(surface).toHaveCSS("border-radius", radius);
      const netWorth = page
        .getByRole("button", { name: "Net Worth", exact: true })
        .filter({ visible: true });
      await netWorth.click();
      await expect(netWorth).toHaveAttribute("aria-current", "page");
      await expect(netWorth).toHaveCSS("border-radius", radius);
      await expect(netWorth.locator("div").first()).toHaveCSS("border-radius", radius);
      await page.screenshot({ path: info.outputPath("navigation.png") });
    });
  }

for (const [theme, radius] of Object.entries({ flexoki: "8px" }))
  for (const mode of ["light", "dark"] as const)
    for (const width of [1440]) {
      test(`${theme} ${mode} holdings account selector ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await mockRolloutRoutes(page, theme, mode);
        await page.goto("/holdings");
        const selector = page
          .getByRole("combobox")
          .filter({ hasText: "All Accounts" })
          .filter({ visible: true });
        await expect(selector).toHaveCSS("border-radius", radius);
        await selector.click();
        await expect(selector).toHaveAttribute("aria-expanded", "true");
        await page.keyboard.press("Escape");
        await expect(selector).toHaveAttribute("aria-expanded", "false");
      });
    }
