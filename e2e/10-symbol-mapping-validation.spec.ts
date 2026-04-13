import { expect, Page, test } from "@playwright/test";
import { BASE_URL, loginIfNeeded } from "./helpers";

test.describe.configure({ mode: "serial" });

const ASSET_SYMBOL = "SYMVAL_TEST";

test.describe("Symbol Mapping Validation", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  // ── helpers ──────────────────────────────────────────────────────────────

  async function ensureAssetExists() {
    await page.goto(`${BASE_URL}/settings/securities`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: "Securities" })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);

    // Reset portfolio filter so all assets are visible
    const resetBtn = page.getByRole("button", { name: "Reset" });
    if (await resetBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await resetBtn.click();
      await page.waitForTimeout(500);
    }

    // Skip creation if asset already exists
    const existingRow = page.getByRole("row").filter({ hasText: ASSET_SYMBOL });
    if (await existingRow.isVisible({ timeout: 2000 }).catch(() => false)) return;

    await page.getByRole("button", { name: "Add Security" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });

    await page.getByPlaceholder("e.g., AAPL").fill(ASSET_SYMBOL);
    await page.getByPlaceholder("e.g., Apple Inc.").fill("Symbol Validation Test Asset");
    await page.getByRole("button", { name: "Create Security" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({
      timeout: 10000,
    });
    await page.waitForTimeout(1000);

    // Reset filter again after creation
    const resetBtn2 = page.getByRole("button", { name: "Reset" });
    if (await resetBtn2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await resetBtn2.click();
      await page.waitForTimeout(500);
    }

    await expect(page.getByRole("row").filter({ hasText: ASSET_SYMBOL }).first()).toBeVisible({
      timeout: 5000,
    });
  }

  async function openAssetMarketDataTab() {
    await page.goto(`${BASE_URL}/settings/securities`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: "Securities" })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);

    // Reset filter
    const resetBtn = page.getByRole("button", { name: "Reset" });
    if (await resetBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await resetBtn.click();
      await page.waitForTimeout(500);
    }

    const assetRow = page.getByRole("row").filter({ hasText: ASSET_SYMBOL }).first();
    await expect(assetRow).toBeVisible({ timeout: 10000 });

    const actionsBtn = assetRow.getByRole("button", { name: "Open actions" });
    await actionsBtn.click();
    await page.waitForTimeout(300);
    await page.getByRole("menuitem", { name: "Edit" }).click();

    const editSheet = page.getByRole("dialog").first();
    await expect(editSheet).toBeVisible({ timeout: 5000 });

    // Click the Market Data tab
    await page.getByRole("tab", { name: "Market Data" }).click();
    await page.waitForTimeout(300);

    // Symbol Mapping section is only visible when pricing is Automatic.
    // If the asset is in Manual mode, enable Automatic pricing first.
    const pricingSwitch = page.getByRole("switch").first();
    if (await pricingSwitch.isVisible({ timeout: 2000 }).catch(() => false)) {
      const isChecked = await pricingSwitch.getAttribute("aria-checked");
      if (isChecked === "false") {
        await pricingSwitch.click();
        await page.waitForTimeout(500);
        // Confirm if a confirmation dialog appears
        const confirmBtn = page.getByRole("button", { name: /confirm|enable|yes/i }).first();
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn.click();
          await page.waitForTimeout(300);
        }
      }
    }

    // Wait for the Symbol Mapping "Add" button to be visible
    await expect(page.getByRole("button", { name: "Add" })).toBeVisible({ timeout: 5000 });
  }

  async function addMappingRow(provider: string, symbol: string) {
    // Scope to the mapping table (contains "Provider" column header)
    const mappingTable = page.locator("table").filter({
      has: page.getByRole("columnheader", { name: "Provider" }),
    });

    // Click Add to create a new mapping row
    await page.getByRole("button", { name: "Add" }).click();
    await page.waitForTimeout(300);

    // The row's provider combobox defaults to YAHOO; change if needed
    if (provider !== "Yahoo Finance") {
      const lastRow = mappingTable.locator("tbody tr").last();
      const providerTrigger = lastRow.getByRole("combobox").first();
      await providerTrigger.click();
      await page.waitForTimeout(300);
      await page.getByRole("option", { name: provider }).click();
      await page.waitForTimeout(300);
    }

    const lastRow = mappingTable.locator("tbody tr").last();
    const symbolInput = lastRow.getByRole("textbox");
    await symbolInput.fill(symbol);
    await page.waitForTimeout(1000);

    return mappingTable.locator("tbody tr").last();
  }

  async function waitForValidation(
    row: ReturnType<typeof page.locator>,
    expected: "valid" | "invalid",
    timeoutMs = 30000,
  ) {
    // Poll directly for the final icon scoped to the specific row
    await expect(row.getByTestId(`symbol-validation-${expected}`)).toBeVisible({
      timeout: timeoutMs,
    });
  }

  async function saveChanges() {
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Asset profile updated successfully")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole("dialog").first()).not.toBeVisible({ timeout: 5000 });
  }

  async function removeMapping(symbol: string) {
    // Re-open the sheet and go to Market Data tab
    await openAssetMarketDataTab();

    const mappingTable = page.locator("table").filter({
      has: page.getByRole("columnheader", { name: "Provider" }),
    });

    // hasText doesn't match React controlled input values — iterate rows and compare inputValue()
    const rows = mappingTable.locator("tbody tr");
    const count = await rows.count();
    let found = false;
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const value = await row.getByRole("textbox").inputValue();
      if (value === symbol) {
        await row.locator("button").last().click();
        await page.waitForTimeout(300);
        found = true;
        break;
      }
    }
    if (!found) throw new Error(`Mapping row for symbol "${symbol}" not found`);

    // Save the removal
    await saveChanges();
  }

  // ── setup ─────────────────────────────────────────────────────────────────

  test("0. Setup: login and create test asset", async () => {
    test.setTimeout(180000);
    await loginIfNeeded(page);
    await ensureAssetExists();
  });

  // ── Yahoo Finance ─────────────────────────────────────────────────────────

  test("1. Yahoo Finance — valid symbol shows green check and price after save", async () => {
    test.setTimeout(120000);
    await openAssetMarketDataTab();
    const row = await addMappingRow("Yahoo Finance", "AAPL");
    await waitForValidation(row, "valid", 30000);
    await saveChanges();

    // Re-open and verify the latest price card is shown
    await openAssetMarketDataTab();
    await expect(page.getByText("Latest price")).toBeVisible({ timeout: 30000 });

    await removeMapping("AAPL");
  });

  test("2. Yahoo Finance — invalid symbol shows red error and mapping is persisted after save", async () => {
    test.setTimeout(120000);
    await openAssetMarketDataTab();
    const row = await addMappingRow("Yahoo Finance", "INVALID_TICKER_XYZ_E2E");
    await waitForValidation(row, "invalid", 30000);
    await saveChanges();

    // Re-open and verify the invalid mapping was persisted (removeMapping throws if not found)
    await removeMapping("INVALID_TICKER_XYZ_E2E");
  });

  // ── Börse Frankfurt ───────────────────────────────────────────────────────

  test("3. Börse Frankfurt — valid ISIN shows green check and price after save", async () => {
    test.setTimeout(120000);
    await openAssetMarketDataTab();
    const row = await addMappingRow("Börse Frankfurt", "DE0007164600");
    await waitForValidation(row, "valid", 30000);
    await saveChanges();

    // Re-open and verify the latest price card is shown
    await openAssetMarketDataTab();
    await expect(page.getByText("Latest price")).toBeVisible({ timeout: 30000 });

    await removeMapping("DE0007164600");
  });

  test("4. Börse Frankfurt — invalid symbol shows red error and mapping is persisted after save", async () => {
    test.setTimeout(120000);
    await openAssetMarketDataTab();
    const row = await addMappingRow("Börse Frankfurt", "INVALID_TICKER_XYZ_E2E");
    await waitForValidation(row, "invalid", 30000);
    await saveChanges();

    // Re-open and verify the invalid mapping was persisted (removeMapping throws if not found)
    await removeMapping("INVALID_TICKER_XYZ_E2E");
  });
});
