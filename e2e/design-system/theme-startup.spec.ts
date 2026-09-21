import { expect, test } from "@playwright/test";
import { themes } from "../../apps/frontend/src/themes/generated/registry";

// The branded splash (public/splash.css) paints the body before React renders.
const SPLASH_BACKGROUND = "rgb(16, 15, 15)"; // #100f0f

for (const theme of themes) {
  for (const mode of ["light", "dark"]) {
    test(`cached ${theme.id}/${mode} applies before React`, async ({ page }) => {
      await page.route("**/src/main.tsx*", (route) => route.abort());
      await page.addInitScript(
        ({ id, mode }) => {
          localStorage.setItem("wealthfolio-theme-id", id);
          localStorage.setItem("wealthfolio-theme", mode);
          localStorage.setItem("wealthfolio-font", "font-serif");
        },
        { id: theme.id, mode },
      );
      await page.goto("/", { waitUntil: "domcontentloaded" });
      for (let load = 0; load < 2; load++) {
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme.id);
        await expect(page.locator("html")).toHaveClass(new RegExp(mode));
        await expect(page.locator("body")).toHaveClass(/font-serif/);
        expect(
          await page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
          ),
        ).toBe(theme[mode as "light" | "dark"].background);
        await expect(page.locator("#root")).toBeEmpty();
        await expect(page.locator("body")).toHaveCSS("background-color", SPLASH_BACKGROUND);
        if (load === 0) await page.reload({ waitUntil: "domcontentloaded" });
      }
    });
  }
}

test("unknown cached ID falls back without replacing it and system mode resolves before React", async ({
  page,
}) => {
  await page.route("**/src/main.tsx*", (route) => route.abort());
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    localStorage.setItem("wealthfolio-theme-id", "future-palette");
    localStorage.setItem("wealthfolio-theme", "system");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "flexoki");
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem("wealthfolio-theme-id"))).toBe(
    "future-palette",
  );
});

test("an open body portal inherits a same-mode palette switch", async ({ page }) => {
  await page.goto("/e2e/design-system/?theme=flexoki&mode=dark");
  await page.getByRole("button", { name: "Open dialog" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const before = await dialog.evaluate((node) =>
    getComputedStyle(node).getPropertyValue("--popover"),
  );
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "newspaper";
  });
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate((node) => getComputedStyle(node).getPropertyValue("--popover")),
  ).not.toBe(before);
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("the dark splash yields to the selected background when the app renders", async ({ page }) => {
  await page.route("**/src/main.tsx*", (route) => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem("wealthfolio-theme-id", "newspaper");
    localStorage.setItem("wealthfolio-theme", "light");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toHaveCSS("background-color", SPLASH_BACKGROUND);
  await page.locator("#root").evaluate((root) => root.append(document.createElement("main")));
  const expected = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--background)";
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  });
  await expect(page.locator("body")).toHaveCSS("background-color", expected);
});
