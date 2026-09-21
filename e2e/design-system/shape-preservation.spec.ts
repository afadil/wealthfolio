import { readThemeGeometry } from "./theme-geometry";
import { expect, test } from "@playwright/test";
import { themes } from "../../apps/frontend/src/themes/generated/registry";

for (const theme of themes)
  for (const width of [390, 1440]) {
    test(`${theme.id} caller overrides and overlay placement at ${width}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/e2e/design-system/?theme=${theme.id}&mode=light&contracts=1`);
      const geometry = await readThemeGeometry(page);
      const fixture = page.getByRole("region", { name: "Shape preservation" });
      await expect(fixture.getByTestId("flush-card")).toHaveCSS("padding", "0px");
      await expect(fixture.getByLabel("Compact field")).toHaveCSS("height", "32px");
      await expect(fixture.getByLabel("Compact field")).toHaveCSS("border-radius", "0px");
      const group = fixture.getByTestId("compact-group");
      const groupButton = fixture.getByRole("button", { name: "Group action" });
      const groupBounds = await group.boundingBox();
      const childBounds = await groupButton.boundingBox();
      expect(childBounds!.height).toBeLessThanOrEqual(groupBounds!.height);
      expect(childBounds!.height).toBe(childBounds!.width);
      const icon = fixture.getByRole("button", { name: "Standalone icon" });
      await expect(icon).toHaveCSS("height", width < 768 ? "44px" : "32px");
      await expect(icon).toHaveCSS("width", width < 768 ? "44px" : "32px");
      const select = fixture.getByRole("combobox", { name: "Account scope" });
      await expect(select).toHaveCSS("border-radius", geometry.control);
      await expect(fixture.getByTestId("themed-date")).toHaveCSS(
        "border-radius",
        await select.evaluate((node) => getComputedStyle(node).borderRadius),
      );
      for (const control of [
        group,
        fixture.getByLabel("Standard field"),
        fixture.getByLabel("Notes"),
      ]) {
        await expect(control).toHaveCSS(
          "border-radius",
          await select.evaluate((node) => getComputedStyle(node).borderRadius),
        );
      }
      const periods = fixture.getByRole("group", { name: "Themed periods" });
      await periods.getByRole("button", { name: "3M", exact: true }).click();
      const selectedPeriod = periods.getByRole("button", { name: "3M", exact: true });
      await expect(selectedPeriod).toHaveAttribute("aria-pressed", "true");
      for (const surface of [periods, selectedPeriod, selectedPeriod.locator("div")]) {
        await expect(surface).toHaveCSS("border-radius", geometry.segmented);
      }
      await select.click();
      await page.getByRole("option", { name: "Retirement" }).click();
      await expect(select).toContainText("Retirement");
      for (const side of ["left", "right", "top", "bottom"]) {
        const trigger = fixture.getByRole("button", { name: `Open ${side} sheet` });
        await trigger.click();
        const sheet = page.locator(`[data-slot="sheet-content"][data-side="${side}"]`);
        await expect(sheet).toBeVisible();
        const radius = geometry.sheet;
        await expect(sheet).toHaveCSS(
          "border-top-left-radius",
          side === "right" || side === "bottom" ? radius : "0px",
        );
        await expect(sheet).toHaveCSS(
          "border-bottom-right-radius",
          side === "left" || side === "top" ? radius : "0px",
        );
        await page.keyboard.press("Escape");
        await expect(sheet).toBeHidden();
        await expect(trigger).toBeFocused();
      }
      await fixture.getByRole("button", { name: "Open confirmation" }).click();
      const confirmation = page.getByRole("alertdialog");
      await expect(confirmation).toHaveCSS("border-bottom-left-radius", geometry.confirmation);
      await confirmation.getByRole("button", { name: "Cancel example" }).click();
      expect(errors).toEqual([]);
    });
  }
