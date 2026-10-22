import { expect, test, type Page } from "@playwright/test";
import type { ImportTemplateData } from "../apps/frontend/src/lib/types";
import { BASE_URL, createAccount, loginIfNeeded } from "./helpers";

async function saveTemplate(page: Page, buttonName: string): Promise<ImportTemplateData> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/activities/import/templates") &&
        response.request().method() === "POST",
    ),
    page.getByRole("button", { name: buttonName, exact: true }).click(),
  ]);
  expect(response.ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Update Template", exact: true })).toBeEnabled();
  return response.json();
}

for (const direction of ["ltr", "rtl"]) {
  test(`CSV template saving without randomUUID (${direction})`, async ({ page }) => {
    test.setTimeout(180_000);
    await loginIfNeeded(page);
    const accountName = `Template saving ${direction}`;
    await createAccount(page, accountName, "USD", "Transactions");
    await page.goto(`${BASE_URL}/import?dir=${direction}`);
    await expect(page.locator("html")).toHaveAttribute("dir", direction);

    await page.getByRole("combobox", { name: /Select an account/i }).click();
    await page.getByPlaceholder("Search accounts...").fill(accountName);
    await page.getByRole("option", { name: new RegExp(accountName) }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "template.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Date,Activity Type,Amount,Currency\n2026-10-01,DEPOSIT,100,USD\n"),
    });
    await page.getByRole("button", { name: "Configure Mapping" }).click();
    const nameInput = page.getByRole("textbox", { name: "Template Name", exact: true });
    await nameInput.fill(`CSV template ${direction}`);

    // Reproduce browsers where randomUUID is unavailable while getRandomValues works.
    await page.evaluate(() => {
      Object.defineProperty(globalThis.crypto, "randomUUID", {
        configurable: true,
        value: undefined,
      });
    });

    const saved = await saveTemplate(page, "Save Template");
    expect(saved.id).toMatch(/^[A-Za-z0-9_-]{21}$/);
    expect(saved.scope).toBe("USER");

    await nameInput.fill(`Updated CSV template ${direction}`);
    const updated = await saveTemplate(page, "Update Template");
    expect(updated.id).toBe(saved.id);
    expect(updated.name).toBe(`Updated CSV template ${direction}`);

    await nameInput.fill(`Copied CSV template ${direction}`);
    const copied = await saveTemplate(page, "Save as New");
    expect(copied.id).toMatch(/^[A-Za-z0-9_-]{21}$/);
    expect(copied.id).not.toBe(saved.id);
    expect(copied.fieldMappings).toEqual(updated.fieldMappings);
    expect(copied.parseConfig).toEqual(updated.parseConfig);

    // A fresh page load reads the templates back through the real API and SQLite.
    await page.reload();
    await page.getByRole("combobox", { name: "Template", exact: true }).click();
    await expect(page.getByRole("option", { name: updated.name, exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: copied.name, exact: true })).toBeVisible();
  });
}
