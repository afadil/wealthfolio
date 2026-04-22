/**
 * E2E tests for configurable cost basis methods feature.
 *
 * Covers:
 * - New account form defaults to FIFO
 * - Creating an account with WAC cost basis method
 * - Verifying saved WAC method persists in edit dialog
 * - Changing cost basis method triggers a confirmation dialog
 *
 * Requires: spec 01 (onboarding) must have run first on the same database.
 */

import { expect, Page, test } from "@playwright/test";
import { BASE_URL, loginIfNeeded } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("Cost Basis Method", () => {
  const ACCOUNT_NAME = "WAC Test Account";

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginIfNeeded(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  // Helper: open the "Add Account" dialog
  async function openAddAccountDialog() {
    await page.goto(`${BASE_URL}/settings/accounts`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Add account/i }).click();
    await expect(page.getByRole("heading", { name: /Add Account/i })).toBeVisible();
  }

  // Helper: open the edit dialog for a named account
  async function openEditDialog(accountName: string) {
    await page.goto(`${BASE_URL}/settings/accounts`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();

    // The account list item contains a link with the account name.
    // The AccountOperations dropdown trigger has sr-only text "Open".
    // Scope to the list item div that contains the account link.
    const accountLink = page.getByRole("link", { name: accountName }).first();
    await expect(accountLink).toBeVisible({ timeout: 5000 });

    // Walk up to the flex-row container (p-4 div), then find the "Open" button within it
    const accountItem = page
      .locator("div.flex.items-center.justify-between.p-4")
      .filter({ has: accountLink })
      .first();
    const moreButton = accountItem.getByRole("button", { name: "Open" });
    await moreButton.click();

    // Wait for the dropdown to appear and click Edit
    const editItem = page.getByRole("menuitem", { name: "Edit" });
    await expect(editItem).toBeVisible({ timeout: 3000 });
    await editItem.click();

    await expect(page.getByRole("heading", { name: /Update Account/i })).toBeVisible({
      timeout: 5000,
    });
  }

  test("1. New account form defaults to FIFO cost basis method", async () => {
    await openAddAccountDialog();

    // Verify all three options are visible
    await expect(page.getByRole("radio", { name: /FIFO/i })).toBeVisible();
    await expect(page.getByRole("radio", { name: /LIFO/i })).toBeVisible();
    await expect(page.getByRole("radio", { name: /WAC/i })).toBeVisible();

    // FIFO should be checked by default
    await expect(page.getByRole("radio", { name: /FIFO/i })).toBeChecked();

    // LIFO and WAC should not be checked
    await expect(page.getByRole("radio", { name: /LIFO/i })).not.toBeChecked();
    await expect(page.getByRole("radio", { name: /WAC/i })).not.toBeChecked();

    // Close dialog without saving
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: /Add Account/i })).not.toBeVisible({
      timeout: 5000,
    });
  });

  test("2. User can create an account with WAC cost basis method", async () => {
    await page.goto(`${BASE_URL}/settings/accounts`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();

    // Delete the account if it already exists from a previous run so we always start fresh
    const existingLink = page.getByRole("link", { name: ACCOUNT_NAME }).first();
    if (await existingLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      const accountItem = page
        .locator("div.flex.items-center.justify-between.p-4")
        .filter({ has: existingLink })
        .first();
      await accountItem.getByRole("button", { name: "Open" }).click();
      const deleteItem = page.getByRole("menuitem", { name: "Delete" });
      await expect(deleteItem).toBeVisible({ timeout: 3000 });
      await deleteItem.click();
      // Confirm the delete alert dialog
      const confirmButton = page.getByRole("button", { name: "Delete" }).last();
      await expect(confirmButton).toBeVisible({ timeout: 3000 });
      await confirmButton.click();
      // Wait for account to disappear
      await expect(existingLink).not.toBeVisible({ timeout: 5000 });
    }

    await page.getByRole("button", { name: /Add account/i }).click();
    await expect(page.getByRole("heading", { name: /Add Account/i })).toBeVisible();

    // Fill account name
    await page.getByLabel("Account Name").fill(ACCOUNT_NAME);

    // Select USD currency
    const currencyTrigger = page.getByLabel("Currency");
    const currentCurrencyText = await currencyTrigger.textContent();
    if (!currentCurrencyText?.includes("USD")) {
      await currencyTrigger.click();
      await page.waitForSelector('[role="listbox"], [role="option"]', {
        state: "visible",
        timeout: 5000,
      });
      const searchInput = page.getByPlaceholder("Search currency...");
      if (await searchInput.isVisible()) {
        await searchInput.fill("USD");
        await page.waitForTimeout(200);
      }
      await page.getByRole("option", { name: /USD/ }).first().click();
      await page.waitForTimeout(200);
    }

    // Select Transactions tracking mode
    await page.getByRole("radio", { name: /Transactions/i }).click();

    // Select WAC cost basis method
    await page.getByRole("radio", { name: /WAC/i }).click();
    await expect(page.getByRole("radio", { name: /WAC/i })).toBeChecked();

    // Submit
    const submitButton = page.getByRole("button", { name: /Add Account/i }).last();
    await submitButton.click();

    // Dialog closes
    await expect(page.getByRole("heading", { name: /Add Account/i })).not.toBeVisible({
      timeout: 10000,
    });

    // Account appears in the list
    await expect(page.getByRole("link", { name: ACCOUNT_NAME }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("3. Saved WAC method is retained when reopening edit dialog", async () => {
    await openEditDialog(ACCOUNT_NAME);

    // WAC should still be selected
    await expect(page.getByRole("radio", { name: /WAC/i })).toBeChecked();
    await expect(page.getByRole("radio", { name: /FIFO/i })).not.toBeChecked();
    await expect(page.getByRole("radio", { name: /LIFO/i })).not.toBeChecked();

    // Close without saving
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: /Update Account/i })).not.toBeVisible({
      timeout: 5000,
    });
  });

  test("4. Changing cost basis method shows confirmation dialog", async () => {
    await openEditDialog(ACCOUNT_NAME);

    // Switch from WAC to LIFO
    await page.getByRole("radio", { name: /LIFO/i }).click();
    await expect(page.getByRole("radio", { name: /LIFO/i })).toBeChecked();

    // Click Update Account (save)
    await page.getByRole("button", { name: /Update Account/i }).click();

    // Confirmation AlertDialog should appear
    await expect(
      page.getByRole("alertdialog").filter({ hasText: /Change cost basis method/i }),
    ).toBeVisible({ timeout: 5000 });

    // Click Confirm Change
    await page.getByRole("button", { name: "Confirm Change" }).click();

    // Dialog closes, account is saved
    await expect(page.getByRole("heading", { name: /Update Account/i })).not.toBeVisible({
      timeout: 10000,
    });

    // Verify LIFO is now saved by reopening the edit dialog
    await openEditDialog(ACCOUNT_NAME);
    await expect(page.getByRole("radio", { name: /LIFO/i })).toBeChecked();

    // Close
    await page.getByRole("button", { name: "Cancel" }).click();
  });
});
