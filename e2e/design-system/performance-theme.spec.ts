import { expect, test } from "@playwright/test";
import { themes } from "../../apps/frontend/src/themes/generated/registry";

const originalFlexoki = [
  "#4385BE",
  "#CE5D97",
  "#3AA99F",
  "#8B7EC8",
  "#879A39",
  "#D0A215",
  "#DA702C",
  "#D14D41",
];

test("desktop and mobile lines and legends follow all palette modes without remapping series", async ({
  page,
}) => {
  await page.route("**/api/**", (route) => route.abort("blockedbyclient"));
  await page.goto("/e2e/performance-theme/");
  for (const theme of themes) {
    for (const mode of ["light", "dark"] as const) {
      await page.getByLabel("Palette").selectOption(theme.id);
      await page.getByLabel("Mode", { exact: true }).selectOption(mode);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme.id);
      await expect(page.locator("html")).toHaveClass(new RegExp(mode));
      for (const viewport of ["Desktop", "Mobile"]) {
        const chart = page.getByRole("region", { name: `${viewport} performance` });
        const paths = chart.locator(".recharts-line-curve");
        await expect(paths).toHaveCount(8);
        const expected = await page.evaluate(
          (colors) =>
            colors.map((color) => {
              const element = document.createElement("span");
              element.style.color = color;
              document.body.append(element);
              const resolved = getComputedStyle(element).color;
              element.remove();
              return resolved;
            }),
          theme.id === "flexoki"
            ? originalFlexoki
            : Array.from(
                { length: 8 },
                (_, i) => theme[mode][`performance-series-${i + 1}` as keyof typeof theme.light],
              ),
        );
        await expect
          .poll(
            () =>
              paths.evaluateAll((elements) =>
                elements.map((element) => getComputedStyle(element).stroke),
              ),
            { message: `${theme.id} ${mode} ${viewport} line colors` },
          )
          .toEqual(expected);
        for (let index = 0; index < 8; index++) {
          await expect(paths.nth(index)).toHaveAttribute("name", `Series ${index + 1}`);
          const label = chart.getByText(`Series ${index + 1}`, { exact: true });
          await expect(label).toBeAttached();
          const swatch = label.locator("div").first();
          await expect
            .poll(() => swatch.evaluate((element) => getComputedStyle(element).backgroundColor), {
              message: `${theme.id} ${mode} ${viewport} legend ${index + 1}`,
            })
            .toBe(expected[index]);
        }
        await expect(paths.nth(7)).toHaveAttribute("stroke-dasharray", /^5(?:px)?[, ]+5/);
      }
    }
  }
});
