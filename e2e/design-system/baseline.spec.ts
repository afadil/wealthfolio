import { expect, test } from "@playwright/test";
import { themes } from "../../apps/frontend/src/themes/generated/registry";

for (const theme of themes) {
  for (const mode of ["light", "dark"]) {
    for (const width of [390, 1440]) {
      test(`${theme.name} ${mode} at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 1000 });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`/e2e/design-system/?mode=${mode}&theme=${theme.id}`);
        await expect(page.getByRole("heading", { name: "Design system baseline" })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await expect(page.getByRole("heading", { name: "Add activity" })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.screenshot({
          path: testInfo.outputPath(`${theme.id}-${mode}-${width}.png`),
          fullPage: true,
          animations: "disabled",
        });
        await page.getByRole("button", { name: "Open dialog" }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.getByLabel("Note", { exact: true }).fill("Synthetic keyboard edit");
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toBeHidden();
        await expect(page.getByRole("button", { name: "Open dialog" })).toBeFocused();
        await page.getByRole("button", { name: "Save example" }).click();
        await expect(page.getByRole("status")).toHaveText("Example submitted");
        expect(errors).toEqual([]);
      });
    }
  }
}
