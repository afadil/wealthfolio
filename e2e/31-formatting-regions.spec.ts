import { expect, test } from "@playwright/test";
import { completeOnboardingIfNeeded, gotoAppPath } from "./helpers";

test("new formatting regions persist after saving and reloading settings", async ({ page }) => {
  test.setTimeout(120000);
  await completeOnboardingIfNeeded(page);
  await gotoAppPath(page, "/settings/general");

  const regionSelect = page.getByTestId("formatting-locale-select");
  const preview = page.getByTestId("formatting-locale-preview");

  for (const [label, code, decimal] of [
    ["Austria", "AT", /1\s234,56/],
    ["Romania", "RO", /1\.234,56/],
    ["Bulgaria", "BG", /1234,56/],
  ] as const) {
    // The region list is searchable: narrow it by name, then pick the option.
    await regionSelect.click();
    await page.getByPlaceholder("Search...").fill(label);
    const option = page.getByRole("option", { name: label, exact: true });
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname.endsWith("/settings"),
    );
    await option.click();
    const response = await saved;
    expect(response.request().postDataJSON()).toMatchObject({ formattingRegion: code });
    expect(response.status(), await response.text()).toBe(200);
    expect(await response.json()).toMatchObject({ formattingRegion: code });
    await expect(regionSelect).toHaveText(label);
    await expect(preview).toContainText(decimal);

    await page.reload();
    await expect(regionSelect).toHaveText(label);
    await expect(preview).toContainText(decimal);
  }

  await regionSelect.click();
  await page.getByRole("option", { name: /^System/ }).click();
  await expect(regionSelect).toContainText("System");
});
