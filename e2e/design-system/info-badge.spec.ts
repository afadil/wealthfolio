import { expect, test } from "@playwright/test";
import { themes } from "../../apps/frontend/src/themes/generated/registry";

for (const theme of themes)
  for (const mode of ["light", "dark"]) {
    test(`${theme.id} ${mode} info badge reuses existing information colors`, async ({ page }) => {
      await page.goto(`/e2e/design-system/?theme=${theme.id}&mode=${mode}`);
      const badge = page.getByTestId("info-badge");
      await expect(badge).toBeVisible();
      const result = await badge.evaluate((element) => {
        const reference = document.createElement("span");
        reference.style.background = "var(--toast-info-bg)";
        reference.style.color = "var(--toast-info-fg)";
        document.body.append(reference);
        const expected = getComputedStyle(reference);
        const actual = getComputedStyle(element);
        const result = {
          actual: [actual.backgroundColor, actual.color],
          expected: [expected.backgroundColor, expected.color],
        };
        reference.remove();
        return result;
      });
      expect(result.actual).toEqual(result.expected);
    });
  }
