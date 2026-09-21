import { expect, test, type Page } from "@playwright/test";
import { themes } from "../../apps/frontend/src/themes/generated/registry";

async function tabToThemeGallery(page: Page, key = "Tab") {
  const first = page.getByRole("radio").first();
  // Preview toolbar controls precede the gallery in the natural tab order.
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.keyboard.press(key);
    if (await first.evaluate((input) => input === document.activeElement)) return;
  }
  await expect(first).toBeFocused();
}

for (const mode of ["light", "dark"]) {
  for (const width of [390, 1440]) {
    test(`theme gallery keyboard navigation in RTL, ${mode}, ${width}px`, async ({
      page,
      browserName,
    }, testInfo) => {
      // This macOS WebKit runner skips native radios with Tab, including on a
      // plain HTML control page. Option-Tab traverses all controls there.
      const tabKey = browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(
        `/e2e/design-system/?theme=flexoki&mode=${mode}&gallery=1&rtl=1&locale=de-DE`,
      );
      const radios = page.getByRole("radio");
      await expect(radios).toHaveCount(themes.length);
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

      // Reach the group through normal keyboard navigation, then visit every
      // discovered theme in both directions using native radio behavior.
      await tabToThemeGallery(page, tabKey);
      await expect(radios.first()).toBeFocused();
      for (let index = 1; index < themes.length; index++) {
        await page.keyboard.press("ArrowDown");
        const theme = themes[index];
        const radio = page.getByRole("radio", { name: theme.name, exact: true });
        await expect(radio).toBeChecked();
        await expect(radio).toBeFocused();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme.id);
        expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(
          mode === "dark",
        );
        const focusIndicator = await radio.evaluate((input) => {
          const card = input.nextElementSibling!;
          return {
            shadow: getComputedStyle(card).boxShadow,
          };
        });
        expect(focusIndicator.shadow).not.toBe("none");
      }
      // Native WebKit stops at the last radio; Chromium wraps. Traverse back
      // explicitly instead of imposing Chromium's boundary behavior on both.
      for (let index = themes.length - 2; index >= 0; index--) {
        await page.keyboard.press("ArrowUp");
        await expect(radios.nth(index)).toBeChecked();
        await expect(radios.nth(index)).toBeFocused();
        await expect(page.locator("html")).toHaveAttribute("data-theme", themes[index].id);
      }
      await page.keyboard.press(tabKey);
      await expect(page.getByRole("button", { name: "Primary action", exact: true })).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: testInfo.outputPath(`rtl-gallery-${mode}-${width}.png`),
        fullPage: true,
        animations: "disabled",
      });
    });
  }
}

test("theme gallery retains visible keyboard focus in forced colors", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/e2e/design-system/?theme=flexoki&mode=dark&gallery=1");
  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
  await tabToThemeGallery(page);
  await expect(page.getByRole("radio").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const selected = page.getByRole("radio").nth(1);
  await expect(selected).toBeChecked();
  await expect(selected).toBeFocused();
  const indicator = await selected.evaluate((input) => {
    const style = getComputedStyle(input.nextElementSibling!);
    return { outline: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(indicator.outline).not.toBe("none");
  expect(indicator.width).toBeGreaterThanOrEqual(2);
  await page.screenshot({
    path: testInfo.outputPath("forced-colors-focus.png"),
    animations: "disabled",
  });
});
