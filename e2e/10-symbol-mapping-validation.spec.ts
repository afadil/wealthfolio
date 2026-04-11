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
  }

  async function addMappingRow(provider: string, symbol: string) {
    // Click Add to create a new mapping row
    await page.getByRole("button", { name: "Add" }).click();
    await page.waitForTimeout(300);

    // The row's provider combobox defaults to YAHOO; change if needed
    if (provider !== "Yahoo Finance") {
      // Find the combobox in the last table row
      const lastRow = page.locator("tbody tr").last();
      const providerTrigger = lastRow.getByRole("combobox").first();
      await providerTrigger.click();
      await page.waitForTimeout(300);
      await page.getByRole("option", { name: provider }).click();
      await page.waitForTimeout(300);
    }

    // Fill the symbol input in the last row
    const lastRow = page.locator("tbody tr").last();
    const symbolInput = lastRow.getByRole("textbox");
    await symbolInput.fill(symbol);
  }

  async function waitForValidation(expected: "valid" | "invalid", timeoutMs = 30000) {
    // Wait for loading spinner to appear (debounce fires after 800ms)
    await expect(page.getByTestId("symbol-validation-loading")).toBeVisible({
      timeout: 5000,
    });
    // Wait for loading spinner to disappear (network call completes)
    await expect(page.getByTestId("symbol-validation-loading")).not.toBeVisible({
      timeout: timeoutMs,
    });
    // Check final icon
    await expect(page.getByTestId(`symbol-validation-${expected}`)).toBeVisible({ timeout: 3000 });
  }

  async function closeSheet() {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 });
  }

  // ── setup ─────────────────────────────────────────────────────────────────

  test("0. Setup: login and create test asset", async () => {
    test.setTimeout(180000);
    await loginIfNeeded(page);
    await ensureAssetExists();
  });

  // ── Yahoo Finance ─────────────────────────────────────────────────────────

  test("1. Yahoo Finance — valid symbol shows green check", async () => {
    test.setTimeout(60000);
    await openAssetMarketDataTab();
    await addMappingRow("Yahoo Finance", "AAPL");
    await waitForValidation("valid", 30000);
    await closeSheet();
  });

  test("2. Yahoo Finance — invalid symbol shows red error", async () => {
    test.setTimeout(60000);
    await openAssetMarketDataTab();
    await addMappingRow("Yahoo Finance", "INVALID_TICKER_XYZ_E2E");
    await waitForValidation("invalid", 30000);
    await closeSheet();
  });

  // ── Börse Frankfurt ───────────────────────────────────────────────────────

  test("3. Börse Frankfurt — valid ISIN shows green check", async () => {
    test.setTimeout(60000);
    await openAssetMarketDataTab();
    await addMappingRow("Börse Frankfurt", "DE0007164600");
    await waitForValidation("valid", 30000);
    await closeSheet();
  });

  test("4. Börse Frankfurt — invalid symbol shows red error", async () => {
    test.setTimeout(60000);
    await openAssetMarketDataTab();
    await addMappingRow("Börse Frankfurt", "INVALID_TICKER_XYZ_E2E");
    await waitForValidation("invalid", 30000);
    await closeSheet();
  });
});
