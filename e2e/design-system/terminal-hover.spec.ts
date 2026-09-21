import { test, expect } from "@playwright/test";
import { mockRolloutRoutes } from "./rollout-route-helpers";

test("Terminal account selector preserves readable hover text", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockRolloutRoutes(page, "terminal", "dark");
  await page.goto("/holdings");
  const selector = page
    .getByRole("combobox")
    .filter({ hasText: "All Accounts" })
    .filter({ visible: true });
  await expect(selector).toBeVisible();
  await selector.hover();
  await expect(selector).toHaveCSS("color", "rgb(126, 231, 135)");
  await selector.click();
  const option = page.getByRole("option").filter({ hasText: "All Accounts" });
  await option.hover();
  await expect(option).toHaveAttribute("data-selected", "true");
  await expect(option).toHaveCSS("color", "rgb(126, 231, 135)");
  await expect(option).toHaveCSS("background-color", "rgb(18, 44, 26)");
  await page.screenshot({ path: info.outputPath("account-hover.png") });
});
