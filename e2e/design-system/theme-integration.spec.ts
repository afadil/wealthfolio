import { readThemeGeometry } from "./theme-geometry";
import { expect, test, type Page } from "@playwright/test";
import { themes } from "../../apps/frontend/src/themes/generated/registry";

async function mockSettings(page: Page, initialId = "flexoki") {
  await page.addInitScript(() => {
    (window as Window & { themeIntegrationMocked?: boolean }).themeIntegrationMocked = true;
  });
  let settings: Record<string, unknown> = {
    themeId: initialId,
    theme: "light",
    font: "font-serif",
    language: "en",
    formattingRegion: "US",
    baseCurrency: "USD",
    defaultReturnMetric: "twr",
    timezone: "UTC",
    onboardingCompleted: true,
    autoUpdateCheckEnabled: false,
    menuBarVisible: true,
    syncEnabled: false,
  };
  const writes: Record<string, unknown>[] = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === "http://localhost:1434" ||
      url.protocol === "blob:" ||
      url.protocol === "data:"
      ? route.continue()
      : route.abort("blockedbyclient");
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/status")
      return route.fulfill({ json: { requiresPassword: false, oidcEnabled: false } });
    if (path === "/api/v1/settings") {
      if (route.request().method() === "PUT") {
        const updates = route.request().postDataJSON() as Record<string, unknown>;
        writes.push(updates);
        settings = { ...settings, ...updates };
      }
      return route.fulfill({ json: settings });
    }
    return route.abort("blockedbyclient");
  });
  return writes;
}

function normalizeGeometry(value: unknown) {
  // Tailwind can prepend invisible ring/shadow layers; they do not change geometry.
  return JSON.parse(
    JSON.stringify(value ?? null).replaceAll("rgba(0, 0, 0, 0) 0px 0px 0px 0px, ", ""),
  );
}

async function assertGeometryParity(page: Page) {
  const geometry = await readThemeGeometry(page);
  await expect(page.getByTestId("geometry-button")).toHaveCSS("border-radius", geometry.button);
  await expect(page.getByTestId("geometry-card")).toHaveCSS("border-radius", geometry.card);
  // A parked addon has no route viewport; give this synthetic probe the host width.
  await page.locator("iframe").evaluate((node, width) => {
    node.style.width = `${width}px`;
    node.style.height = "600px";
  }, page.viewportSize()?.width ?? 1280);
  const host = await page.evaluate(() => {
    const result: Record<string, Record<string, string>> = {};
    for (const [name, properties] of Object.entries({
      button: ["borderRadius", "height"],
      card: ["borderRadius", "boxShadow"],
      content: ["paddingLeft", "paddingBottom"],
      input: ["borderRadius", "borderTopWidth", "borderLeftWidth", "backgroundColor"],
    })) {
      const style = getComputedStyle(document.querySelector(`[data-testid="geometry-${name}"]`)!);
      result[name] = Object.fromEntries(
        properties.map((property) => [
          property,
          style[property as keyof CSSStyleDeclaration] as string,
        ]),
      );
    }
    return result;
  });
  expect(host.button.borderRadius).toBe(geometry.button);
  expect(host.card.borderRadius).toBe(geometry.card);
  await expect
    .poll(async () =>
      normalizeGeometry(JSON.parse(await page.getByTestId("addon").innerText()).geometry),
    )
    .toEqual(normalizeGeometry(host));
}

for (const theme of themes) {
  test(`${theme.name} saves through settings and survives reload with addon parity`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const writes = await mockSettings(page, theme.id === "flexoki" ? "newspaper" : "flexoki");
    await page.goto("/e2e/theme-integration/");
    await expect(page.getByTestId("addon")).toContainText('"themeId"');
    const iframeCount = page.frames().length;
    const initialBoot = JSON.parse(await page.getByTestId("addon").innerText()).boot as string;
    await page.getByRole("radio", { name: theme.name }).locator("..").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme.id);
    await expect(page.getByTestId("addon")).toContainText(`"themeId":"${theme.id}"`);
    expect(page.frames()).toHaveLength(iframeCount);
    expect((JSON.parse(await page.getByTestId("addon").innerText()) as { boot: string }).boot).toBe(
      initialBoot,
    );
    const hostChart = await page
      .locator("html")
      .evaluate((root) => getComputedStyle(root).getPropertyValue("--chart-1").trim());
    expect(
      (JSON.parse(await page.getByTestId("addon").innerText()) as { chart: string }).chart,
    ).toBe(hostChart);
    await assertGeometryParity(page);
    expect(writes).toContainEqual({ themeId: theme.id });
    await expect(page.locator("body")).toHaveClass(/font-serif/);
    await page.getByLabel("Appearance mode").selectOption("dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByTestId("addon")).toContainText('"mode":"dark"');
    const darkChart = await page
      .locator("html")
      .evaluate((root) => getComputedStyle(root).getPropertyValue("--chart-1").trim());
    expect(
      (JSON.parse(await page.getByTestId("addon").innerText()) as { chart: string }).chart,
    ).toBe(darkChart);
    await assertGeometryParity(page);
    await page.getByRole("button", { name: "Aa Sans" }).click();
    await expect(page.locator("body")).toHaveClass(/font-sans/);
    await expect(page.getByTestId("addon")).toContainText("font-sans");
    await page.reload();
    await expect(page.getByRole("radio", { name: theme.name })).toBeChecked();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator("body")).toHaveClass(/font-sans/);
    await expect(page.getByTestId("addon-error")).toHaveText("");
    await assertGeometryParity(page);
    await page.route("**/src/test/browser/theme-integration.tsx*", (route) => route.abort());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#root")).toBeEmpty();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme.id);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator("body")).toHaveClass(/font-sans/);
  });
}

test("system mode keeps palette/font and first paint uses cached settings before React", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await mockSettings(page, "cupertino");
  await page.goto("/e2e/theme-integration/");
  await page.getByLabel("Appearance mode").selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "cupertino");
  await expect(page.locator("body")).toHaveClass(/font-serif/);
  // Block only the fixture entry; the production synchronous bootstrap and CSS still run.
  await page.route("**/src/test/browser/theme-integration.tsx*", (route) => route.abort());
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#root")).toBeEmpty();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "cupertino");
  await expect(page.locator("body")).toHaveClass(/font-serif/);
});

test("unknown saved IDs fall back without a backend write", async ({ page }) => {
  const writes = await mockSettings(page, "future-theme");
  await page.goto("/e2e/theme-integration/");
  await expect(page.getByRole("radio", { name: "Flexoki" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "flexoki");
  expect(await page.evaluate(() => localStorage.getItem("wealthfolio-theme-id"))).toBe(
    "future-theme",
  );
  expect(writes).toEqual([]);
});
