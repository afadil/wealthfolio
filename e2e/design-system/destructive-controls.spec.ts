import { expect, test, type Locator } from "@playwright/test";
import { themes } from "../../apps/frontend/src/themes/generated/registry";
async function colors(target: Locator) {
  return target.evaluate((element) => {
    const style = getComputedStyle(element);
    const parent = getComputedStyle(element.parentElement!);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    context.fillStyle = parent.backgroundColor;
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = style.backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const background = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = style.color;
    context.fillRect(0, 0, 1, 1);
    const foreground = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    const luminance = (rgb: number[]) =>
      rgb
        .map((c) => c / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const a = luminance(background);
    const b = luminance(foreground);
    return { background, foreground, contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
  });
}
for (const theme of themes)
  for (const mode of ["light", "dark"]) {
    test(`${theme.id} ${mode} destructive rest and hover contrast`, async ({ page }) => {
      await page.goto(`/e2e/design-system/?theme=${theme.id}&mode=${mode}&controls=1`);
      await page.addStyleTag({ content: "* { transition: none !important; }" });
      for (const surface of ["background", "card"])
        for (const kind of ["button", "badge", "link"]) {
          const target = page.getByTestId(`${surface}-${kind}`);
          for (const hover of [false, true]) {
            if (hover) await target.hover();
            else await page.mouse.move(0, 0);
            const result = await colors(target);
            expect(
              result.contrast,
              `${surface}/${kind}/${hover ? "hover" : "rest"}`,
            ).toBeGreaterThanOrEqual(4.5);
            if (theme.id === "flexoki") {
              const reference = page.getByTestId(`${surface}-legacy`);
              if (hover && kind !== "badge") await reference.hover();
              else await page.mouse.move(0, 0);
              const original = await colors(reference);
              expect(result.background).toEqual(original.background);
              expect(result.foreground).toEqual(original.foreground);
            }
          }
        }
    });
  }
test("published host without new control tokens retains prior rendering", async ({ page }) => {
  for (const mode of ["light", "dark"]) {
    await page.goto(`/e2e/design-system/?theme=flexoki&mode=${mode}&controls=1`);
    await page.addStyleTag({
      content:
        ":root { --destructive-control: initial !important; --destructive-control-hover: initial !important; --destructive-control-foreground: initial !important; } * { transition:none !important; }",
    });
    for (const kind of ["button", "badge", "link"])
      for (const hover of [false, true]) {
        const target = page.getByTestId(`card-${kind}`);
        const reference = page.getByTestId("card-legacy");
        if (hover) await target.hover();
        else await page.mouse.move(0, 0);
        const result = await colors(target);
        if (hover && kind !== "badge") await reference.hover();
        else await page.mouse.move(0, 0);
        expect(result).toEqual(await colors(reference));
      }
  }
});
