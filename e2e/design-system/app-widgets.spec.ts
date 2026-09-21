import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`real app widgets follow all themes and modes at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    const apiRequests: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
    });
    await page.goto("/e2e/design-system/?theme=flexoki&mode=light&gallery=1");
    const holdings = page.getByRole("region", { name: "Holdings list", exact: true });
    await expect(holdings.getByRole("button", { name: /ACME.*120 shares/ })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Portfolio insights", exact: true }),
    ).toBeVisible();
    const donuts = page.getByRole("region", { name: "Allocation donuts", exact: true });
    await expect(donuts.locator(".recharts-surface")).toHaveCount(3);
    const regions = page.getByTestId("donut-regions");
    // Click the arc itself; its bounding-box center lies in the donut hole.
    await regions
      .locator(".recharts-pie-sector path")
      .first()
      .click({ position: { x: 35, y: 40 } });
    await expect(regions.getByRole("button", { name: "Regions", exact: true })).toBeVisible();
    await expect(regions.getByText("United States", { exact: true })).toBeVisible();
    await regions.getByRole("button", { name: "Regions", exact: true }).click();
    await expect(regions.locator(".recharts-pie-sector")).toHaveCount(3);
    const composition = page.getByRole("region", { name: "Composition chart", exact: true });
    await expect(composition.locator(".recharts-surface")).toBeVisible();
    const performance = page.getByTestId("performance-widget");
    await expect(performance.locator(".recharts-surface:visible")).toBeVisible();
    await performance.getByRole("button", { name: "1M", exact: true }).click();
    await expect(performance.getByRole("button", { name: "1M", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    for (const theme of ["Flexoki", "Ember", "Newspaper", "Cupertino"]) {
      await page.getByRole("radio", { name: theme, exact: true }).locator("..").click();
      for (const mode of ["light", "dark"]) {
        await page
          .getByRole("switch", { name: "Dark mode", exact: true })
          .setChecked(mode === "dark");
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme.toLowerCase());
        await expect(composition.locator(".recharts-surface")).toBeVisible();
        await expect(performance.locator(".recharts-line-curve:visible")).toHaveCount(2);
        await expect(donuts.locator(".recharts-surface")).toHaveCount(3);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
    }
    await page.getByRole("region", { name: "App widgets" }).screenshot({
      path: testInfo.outputPath(`app-widgets-${width}.png`),
      animations: "disabled",
    });
    expect(errors).toEqual([]);
    expect(apiRequests).toEqual([]);
  });
}
