import { readThemeGeometry } from "./theme-geometry";
import { expect, test } from "@playwright/test";
import { themes } from "../../apps/frontend/src/themes/generated/registry";

for (const theme of themes) {
  const style = theme.shape;
  for (const width of [390, 1440]) {
    test(`${theme.id} geometry and light/dark preview at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(
        "/e2e/design-system/?theme=flexoki&mode=light&treatment=proposed&contrast=proposed&gallery=1",
      );
      await expect(page.getByLabel("Shape style")).toHaveCount(0);
      await page.getByRole("radio", { name: theme.name, exact: true }).locator("..").click();
      const geometry = await readThemeGeometry(page);
      const darkMode = page.getByRole("switch", { name: "Dark mode", exact: true });
      const primary = page.getByRole("button", { name: "Primary action", exact: true });
      await expect(primary).toHaveCSS("border-radius", geometry.button);
      await expect(primary).toHaveCSS("height", geometry.height);
      const field = page.getByLabel("Account name", { exact: true });
      await field.focus();
      await expect(field).toHaveCSS("box-shadow", /3px/);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: testInfo.outputPath(`${style}-light-${width}.png`),
        fullPage: true,
      });
      await darkMode.click();
      await expect(darkMode).toBeChecked();
      await expect(page.locator("html")).toHaveClass(/dark/);
      expect(
        await page.evaluate(() =>
          document.documentElement.style.getPropertyValue("--muted-foreground"),
        ),
      ).toBe("");
      expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe("dark");
      await page.screenshot({
        path: testInfo.outputPath(`${style}-dark-${width}.png`),
        fullPage: true,
      });
      await darkMode.click();
      await expect(darkMode).not.toBeChecked();
      expect(
        await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
        ),
      ).toBe(theme.light.background);
      await page.reload();
      await expect(page.getByRole("radio", { name: theme.name, exact: true })).toBeChecked();
      await expect(darkMode).not.toBeChecked();
      await page.getByRole("button", { name: "Open dialog" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      expect(await dialog.evaluate((node) => getComputedStyle(node).borderTopLeftRadius)).toBe(
        geometry.dialog,
      );
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(errors).toEqual([]);
    });
  }
}
