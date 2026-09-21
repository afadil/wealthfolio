import { expect, test } from "@playwright/test";
import { themes } from "../../apps/frontend/src/themes/generated/registry";

for (const theme of themes) {
  for (const width of [390, 1440]) {
    test(`${theme.id} form field consistency at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      for (const mode of ["light", "dark"]) {
        await page.goto(`/e2e/design-system/?theme=${theme.id}&mode=${mode}&contracts=1`);
        const fixture = page.getByRole("region", { name: "Shape preservation" });
        const input = fixture.getByLabel("Standard field");
        await expect(input).toBeVisible();
        const expected = await input.evaluate((node) => {
          const style = getComputedStyle(node);
          return Object.fromEntries(
            [
              "height",
              "padding-left",
              "padding-top",
              "border-radius",
              "box-shadow",
              "background-color",
              "font-size",
            ].map((key) => [key, style.getPropertyValue(key)]),
          );
        });
        for (const control of [
          fixture.getByRole("combobox", { name: "Account scope" }),
          fixture.getByTestId("themed-date"),
          fixture.getByRole("combobox", { name: "Field currency" }),
          fixture.getByTestId("field-responsive").locator("button").first(),
          fixture.getByTestId("field-searchable").getByRole("combobox"),
        ]) {
          for (const [property, value] of Object.entries(expected)) {
            await expect(control).toHaveCSS(property, value);
          }
        }
        await expect(fixture.getByTestId("compact-group")).toHaveCSS("height", expected.height);
        await expect(fixture.getByLabel("Compact field")).toHaveCSS("height", "32px");
      }
    });
  }
}
