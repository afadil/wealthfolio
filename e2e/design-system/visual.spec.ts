import { expect, test } from "@playwright/test";
import { directions, modes, openGallery, overlays, widths } from "./gallery";

// Pixel comparisons against a baseline recorded on the same machine before a
// change (see e2e/README.md). A primitive swap should not move a pixel.

for (const dir of directions) {
  // Left-to-right keeps its original snapshot names.
  const suffix = dir === "rtl" ? "-rtl" : "";
  const label = dir === "rtl" ? ", rtl" : "";
  for (const mode of modes) {
    for (const width of widths) {
      test(`gallery, ${mode}, ${width}px${label}`, async ({ page }) => {
        const errors = await openGallery(page, { mode, width, dir });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await expect(page).toHaveScreenshot(`gallery-${mode}-${width}${suffix}.png`, {
          fullPage: true,
        });
        expect(errors).toEqual([]);
      });

      for (const overlay of overlays) {
        test(`${overlay.name} open, ${mode}, ${width}px${label}`, async ({ page }) => {
          const errors = await openGallery(page, { mode, width, dir });
          await overlay.open(page);
          await expect(overlay.content(page)).toBeVisible();
          await expect(page).toHaveScreenshot(`${overlay.name}-${mode}-${width}${suffix}.png`);
          expect(errors).toEqual([]);
        });
      }
    }
  }
}
