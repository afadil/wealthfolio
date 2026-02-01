import { expect, Page, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.describe("Activity Creation Tests", () => {
  const BASE_URL = "http://localhost:1420";
  const TEST_PASSWORD = "password001";
  let page: Page;

  // Test data for activities
  const TEST_DATA = {
    accounts: [
      { name: "Test USD Account", currency: "USD" },
      { name: "Test CAD Account", currency: "CAD" },
    ],
    // Activities to test - organized by type
    activities: {
      deposit: {
        account: "Test USD Account",
        currency: "USD",
        amount: 10000,
        notes: "Initial deposit for testing",
      },
      withdrawal: {
        account: "Test USD Account",
        currency: "USD",
        amount: 500,
        notes: "Test withdrawal",
      },
      buy: {
        account: "Test USD Account",
        currency: "USD",
        symbol: "AAPL",
        quantity: 5,
        price: 150,
        fee: 10,
        notes: "Test buy order",
      },
      buyWithAdvanced: {
        account: "Test USD Account",
        currency: "USD",
        symbol: "MSFT",
        quantity: 3,
        price: 400,
        fee: 5,
        notes: "Buy with advanced options",
        advanced: {
          currency: "USD",
          fxRate: 1.0,
        },
      },
      sell: {
        account: "Test USD Account",
        currency: "USD",
        symbol: "AAPL",
        quantity: 2,
        price: 155,
        fee: 5,
        notes: "Test sell order",
      },
      dividend: {
        account: "Test USD Account",
        currency: "USD",
        symbol: "AAPL",
        amount: 25,
        notes: "Dividend received",
      },
      dividendWithSubtype: {
        account: "Test USD Account",
        currency: "USD",
        symbol: "MSFT",
        amount: 15,
        notes: "Dividend with no subtype",
        subtype: "None",
      },
      transfer: {
        fromAccount: "Test USD Account",
        toAccount: "Test CAD Account",
        amount: 1000,
        notes: "Transfer between accounts",
      },
      fee: {
        account: "Test USD Account",
        currency: "USD",
        amount: 25,
        notes: "Management fee",
      },
      interest: {
        account: "Test USD Account",
        currency: "USD",
        amount: 50,
        notes: "Interest earned",
      },
      tax: {
        account: "Test USD Account",
        currency: "USD",
        amount: 100,
        notes: "Withholding tax",
      },
      split: {
        account: "Test USD Account",
        currency: "USD",
        symbol: "AAPL",
        splitRatio: 2,
        notes: "Stock split 2:1",
      },
      // Custom asset activity
      customAssetBuy: {
        account: "Test USD Account",
        currency: "USD",
        customAsset: {
          symbol: "MYCOIN",
          name: "My Custom Coin",
          assetType: "Cryptocurrency",
          currency: "USD",
        },
        quantity: 100,
        price: 5,
        fee: 1,
        notes: "Custom asset purchase",
      },
    },
  };

  // Helper functions
  async function waitForOverlayClose() {
    await page
      .locator('[data-state="open"][aria-hidden="true"]')
      .waitFor({ state: "hidden", timeout: 5000 })
      .catch(() => {});
  }

  async function openAddActivitySheet() {
    await waitForOverlayClose();
    await page.getByRole("button", { name: "Add Activities" }).click();
    await page.getByRole("button", { name: "Add Transaction" }).click();
    await expect(page.getByRole("heading", { name: "Add Activity" })).toBeVisible();
  }

  async function selectActivityType(type: string) {
    const typeButton = page.getByRole("button", { name: type, exact: true });
    await expect(typeButton).toBeVisible();
    await typeButton.click();
    await page.waitForTimeout(200);
  }

  async function selectAccount(accountName: string, currency: string, label = "Account") {
    const accountSelect = page.locator(`[aria-label="${label}"]`);
    await accountSelect.click();
    await page
      .getByRole("option", { name: new RegExp(`${accountName}.*\\(${currency}\\)`) })
      .first()
      .click();
  }

  async function selectDate() {
    const datePickerButton = page.getByRole("button", { name: "Pick a date" });
    await datePickerButton.click();
    await page.waitForSelector('[role="grid"]', { state: "visible", timeout: 5000 });
    const day15Button = page.getByRole("button", { name: /15,/i }).first();
    await day15Button.click();
    await page.waitForTimeout(200);
  }

  async function searchAndSelectSymbol(symbol: string) {
    const symbolCombobox = page.getByRole("combobox").filter({ hasText: /Select symbol/i });
    await symbolCombobox.click();
    await page.waitForTimeout(200);

    const searchInput = page.getByPlaceholder("Search for symbol");
    await searchInput.fill(symbol);
    await page.waitForTimeout(500);

    const symbolOption = page.getByRole("option", { name: new RegExp(symbol, "i") }).first();
    await expect(symbolOption).toBeVisible({ timeout: 5000 });
    await symbolOption.click();
    await page.waitForTimeout(200);
  }

  async function fillAmount(value: number, label = "Amount") {
    const amountInput = page.getByLabel(label);
    await amountInput.click();
    await amountInput.press("Control+a");
    await amountInput.type(String(value), { delay: 50 });
    await amountInput.blur();
    await page.waitForTimeout(200);
  }

  async function fillQuantity(value: number) {
    const quantityInput = page.getByLabel("Quantity");
    await quantityInput.click();
    await quantityInput.press("Control+a");
    await quantityInput.type(String(value), { delay: 50 });
    await quantityInput.blur();
  }

  async function fillPrice(value: number) {
    const priceInput = page.getByLabel("Price");
    await priceInput.click();
    await priceInput.press("Control+a");
    await priceInput.type(String(value), { delay: 50 });
    await priceInput.blur();
  }

  async function fillFee(value: number) {
    const feeInput = page.getByLabel("Fee");
    await feeInput.click();
    await feeInput.press("Control+a");
    await feeInput.type(String(value), { delay: 50 });
    await feeInput.blur();
  }

  async function fillNotes(text: string) {
    const notesInput = page.getByPlaceholder("Add an optional note...");
    if (await notesInput.isVisible()) {
      await notesInput.fill(text);
      await notesInput.blur();
    }
  }

  async function expandAdvancedOptions() {
    const advancedButton = page.getByRole("button", { name: "Advanced Options" });
    if (await advancedButton.isVisible()) {
      await advancedButton.click();
      await page.waitForTimeout(300);
    }
  }

  async function selectSubtype(subtype: string) {
    const subtypeSelect = page.locator('[aria-label="Subtype"]');
    await subtypeSelect.click();
    await page.getByRole("option", { name: subtype }).click();
  }

  async function fillFxRate(rate: number) {
    const fxRateInput = page.getByLabel("FX Rate");
    await fxRateInput.click();
    await fxRateInput.press("Control+a");
    await fxRateInput.type(String(rate), { delay: 50 });
    await fxRateInput.blur();
  }

  async function submitActivity(activityType: string) {
    const submitButton = page.getByRole("button", { name: new RegExp(`Add ${activityType}`, "i") });
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    // Wait for sheet to close
    await expect(page.getByRole("heading", { name: "Add Activity" })).not.toBeVisible({
      timeout: 20000,
    });
    await page.waitForTimeout(500);
  }

  // Map activity type to display name for verification
  const ACTIVITY_TYPE_DISPLAY: Record<string, string> = {
    DEPOSIT: "Deposit",
    WITHDRAWAL: "Withdrawal",
    BUY: "Buy",
    SELL: "Sell",
    DIVIDEND: "Dividend",
    TRANSFER_OUT: "Transfer Out",
    TRANSFER_IN: "Transfer In",
    FEE: "Fee",
    INTEREST: "Interest",
    TAX: "Tax",
    SPLIT: "Split",
  };

  async function verifyActivityInTable(
    type: string,
    symbol: string | null,
    options?: { amount?: number; quantity?: number },
  ) {
    // Look for the activity row with matching type and symbol
    const displayType = ACTIVITY_TYPE_DISPLAY[type] || type;

    // Find a row containing both the type badge and symbol/Cash
    const displaySymbol = symbol || "Cash";
    const row = page
      .locator("tr")
      .filter({ hasText: displayType })
      .filter({ hasText: displaySymbol });
    await expect(row.first()).toBeVisible({ timeout: 10000 });
  }

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("1. Setup: Login and navigate to app", async () => {
    test.setTimeout(180000);

    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

    // Handle login if needed
    const loginInput = page.getByPlaceholder("Enter your password");
    const dashboardHeading = page.getByRole("heading", { name: "Dashboard" });

    await expect(loginInput.or(dashboardHeading)).toBeVisible({ timeout: 120000 });

    if (await loginInput.isVisible()) {
      await loginInput.fill(TEST_PASSWORD);
      await page.getByRole("button", { name: "Sign In" }).click();
      await expect(dashboardHeading).toBeVisible({ timeout: 15000 });
    }
  });

  test("2. Create test accounts", async () => {
    await page.goto(`${BASE_URL}/settings/accounts`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();

    for (const account of TEST_DATA.accounts) {
      // Check if account already exists
      const existingAccount = page.getByRole("link", { name: account.name });
      if (await existingAccount.isVisible().catch(() => false)) {
        continue; // Skip if account exists
      }

      const addAccountButton = page.getByRole("button", { name: /Add account/i });
      await expect(addAccountButton).toBeVisible();
      await addAccountButton.click();

      await expect(page.getByRole("heading", { name: /Add Account/i })).toBeVisible();

      const nameInput = page.getByLabel("Account Name");
      await expect(nameInput).toBeVisible();
      await nameInput.fill(account.name);

      // Select currency if different from default
      const currencyTrigger = page.getByLabel("Currency");
      const currentCurrencyText = await currencyTrigger.textContent();
      if (!currentCurrencyText?.includes(account.currency)) {
        await currencyTrigger.click();
        await page.waitForSelector('[role="listbox"], [role="option"]', {
          state: "visible",
          timeout: 5000,
        });

        const searchInput = page.getByPlaceholder("Search currency...");
        if (await searchInput.isVisible()) {
          await searchInput.fill(account.currency);
          await page.waitForTimeout(200);
        }

        const option = page.getByRole("option", { name: new RegExp(account.currency) }).first();
        await expect(option).toBeVisible({ timeout: 5000 });
        await option.click();
      }

      // Select Transactions tracking mode
      const transactionsRadio = page.getByRole("radio", { name: /Transactions/i });
      await expect(transactionsRadio).toBeVisible();
      await transactionsRadio.click();

      const submitButton = page.getByRole("button", { name: /Add Account/i }).last();
      await submitButton.click();

      await expect(page.getByRole("heading", { name: /Add Account/i })).not.toBeVisible({
        timeout: 10000,
      });
      await page.waitForTimeout(500);

      await expect(page.getByRole("link", { name: account.name })).toBeVisible({ timeout: 10000 });
    }
  });

  test("3. Create DEPOSIT activity", async () => {
    await page.goto(`${BASE_URL}/activities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 10000 });

    await openAddActivitySheet();
    await selectActivityType("Deposit");

    const deposit = TEST_DATA.activities.deposit;
    await selectAccount(deposit.account, deposit.currency);
    await selectDate();
    await fillAmount(deposit.amount);
    await fillNotes(deposit.notes);

    await submitActivity("Deposit");
    await verifyActivityInTable("DEPOSIT", null, { amount: deposit.amount });
  });

  test("4. Create WITHDRAWAL activity", async () => {
    await page.goto(`${BASE_URL}/activities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 10000 });

    await openAddActivitySheet();
    await selectActivityType("Withdrawal");

    const withdrawal = TEST_DATA.activities.withdrawal;
    await selectAccount(withdrawal.account, withdrawal.currency);
    await selectDate();
    await fillAmount(withdrawal.amount);
    await fillNotes(withdrawal.notes);

    await submitActivity("Withdrawal");
    await verifyActivityInTable("WITHDRAWAL", null, { amount: withdrawal.amount });
  });

  test("5. Create BUY activity", async () => {
    await page.goto(`${BASE_URL}/activities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 10000 });

    await openAddActivitySheet();
    await selectActivityType("Buy");

    const buy = TEST_DATA.activities.buy;
    await selectAccount(buy.account, buy.currency);
    await searchAndSelectSymbol(buy.symbol);
    await selectDate();
    await fillQuantity(buy.quantity);
    await fillPrice(buy.price);
    await fillFee(buy.fee);
    await fillNotes(buy.notes);

    await submitActivity("Buy");
    await verifyActivityInTable("BUY", buy.symbol, { quantity: buy.quantity });
  });

  test("6. Create BUY activity with advanced options", async () => {
    await page.goto(`${BASE_URL}/activities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 10000 });

    await openAddActivitySheet();
    await selectActivityType("Buy");

    const buy = TEST_DATA.activities.buyWithAdvanced;
    await selectAccount(buy.account, buy.currency);
    await searchAndSelectSymbol(buy.symbol);
    await selectDate();
    await fillQuantity(buy.quantity);
    await fillPrice(buy.price);
    await fillFee(buy.fee);

    // Expand advanced options and fill
    await expandAdvancedOptions();
    await fillFxRate(buy.advanced.fxRate);

    await fillNotes(buy.notes);

    await submitActivity("Buy");
    await verifyActivityInTable("BUY", buy.symbol, { quantity: buy.quantity });
  });

  test("7. Create SELL activity", async () => {
    await page.goto(`${BASE_URL}/activities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 10000 });

    await openAddActivitySheet();
    await selectActivityType("Sell");

    const sell = TEST_DATA.activities.sell;
    await selectAccount(sell.account, sell.currency);
    await searchAndSelectSymbol(sell.symbol);
    await selectDate();
    await fillQuantity(sell.quantity);
    await fillPrice(sell.price);
    await fillFee(sell.fee);
    await fillNotes(sell.notes);

    await submitActivity("Sell");
    await verifyActivityInTable("SELL", sell.symbol, { quantity: sell.quantity });
  });

  test("8. Create DIVIDEND activity", async () => {
    await page.goto(`${BASE_URL}/activities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 10000 });

    await openAddActivitySheet();
    await selectActivityType("Dividend");

    const dividend = TEST_DATA.activities.dividend;
    await selectAccount(dividend.account, dividend.currency);
    await searchAndSelectSymbol(dividend.symbol);
    await selectDate();
    await fillAmount(dividend.amount);
    await fillNotes(dividend.notes);

    await submitActivity("Dividend");
    await verifyActivityInTable("DIVIDEND", dividend.symbol, { amount: dividend.amount });
  });

  test("9. Create DIVIDEND activity with subtype", async () => {
    await page.goto(`${BASE_URL}/activities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 10000 });

    await openAddActivitySheet();
    await selectActivityType("Dividend");

    const dividend = TEST_DATA.activities.dividendWithSubtype;
    await selectAccount(dividend.account, dividend.currency);
    await searchAndSelectSymbol(dividend.symbol);
    await selectDate();
    await fillAmount(dividend.amount);

    // Expand advanced options and select subtype
    await expandAdvancedOptions();
    await selectSubtype(dividend.subtype);

    await fillNotes(dividend.notes);

    await submitActivity("Dividend");
    await verifyActivityInTable("DIVIDEND", dividend.symbol, { amount: dividend.amount });
  });

  test("10. Create TRANSFER activity", async () => {
    await page.goto(`${BASE_URL}/activities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 10000 });

    await openAddActivitySheet();
    await selectActivityType("Transfer");

    const transfer = TEST_DATA.activities.transfer;

    // Select from account
    await selectAccount("Test USD Account", "USD", "From Account");

    // Select to account
    await selectAccount("Test CAD Account", "CAD", "To Account");

    await selectDate();
    await fillAmount(transfer.amount);
    await fillNotes(transfer.notes);

    await submitActivity("Transfer");
    // Transfers create two activities: TRANSFER_OUT and TRANSFER_IN
    await verifyActivityInTable("TRANSFER_OUT", null, { amount: transfer.amount });
  });

  test("11. Create FEE activity", async () => {
    await page.goto(`${BASE_URL}/activities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 10000 });

    await openAddActivitySheet();
    await selectActivityType("Fee");

    const fee = TEST_DATA.activities.fee;
    await selectAccount(fee.account, fee.currency);
    await selectDate();
    await fillAmount(fee.amount);
    await fillNotes(fee.notes);

    await submitActivity("Fee");
    await verifyActivityInTable("FEE", null, { amount: fee.amount });
  });

  test("15. Create INTEREST activity", async () => {
    await page.goto(`${BASE_URL}/activities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 10000 });

    await openAddActivitySheet();
    await selectActivityType("Interest");

    const interest = TEST_DATA.activities.interest;
    await selectAccount(interest.account, interest.currency);
    await selectDate();
    await fillAmount(interest.amount);
    await fillNotes(interest.notes);

    await submitActivity("Interest");
    await verifyActivityInTable("INTEREST", null, { amount: interest.amount });
  });

  test("16. Create TAX activity", async () => {
    await page.goto(`${BASE_URL}/activities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 10000 });

    await openAddActivitySheet();
    await selectActivityType("Tax");

    const tax = TEST_DATA.activities.tax;
    await selectAccount(tax.account, tax.currency);
    await selectDate();
    await fillAmount(tax.amount);
    await fillNotes(tax.notes);

    await submitActivity("Tax");
    await verifyActivityInTable("TAX", null, { amount: tax.amount });
  });

  test("17. Create SPLIT activity", async () => {
    await page.goto(`${BASE_URL}/activities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 10000 });

    await openAddActivitySheet();
    await selectActivityType("Split");

    const split = TEST_DATA.activities.split;
    await selectAccount(split.account, split.currency);
    await searchAndSelectSymbol(split.symbol);
    await selectDate();

    // Fill split ratio
    const splitRatioInput = page.getByLabel("Split Ratio");
    await splitRatioInput.click();
    await splitRatioInput.press("Control+a");
    await splitRatioInput.type(String(split.splitRatio), { delay: 50 });
    await splitRatioInput.blur();

    await fillNotes(split.notes);

    await submitActivity("Split");
    await verifyActivityInTable("SPLIT", split.symbol);
  });

  test("18. Create BUY activity with custom asset", async () => {
    await page.goto(`${BASE_URL}/activities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 10000 });

    await openAddActivitySheet();
    await selectActivityType("Buy");

    const customBuy = TEST_DATA.activities.customAssetBuy;
    await selectAccount(customBuy.account, customBuy.currency);

    // Click symbol combobox and search for custom asset
    const symbolCombobox = page.getByRole("combobox").filter({ hasText: /Select symbol/i });
    await symbolCombobox.click();
    await page.waitForTimeout(200);

    const searchInput = page.getByPlaceholder("Search for symbol");
    await searchInput.fill(customBuy.customAsset.symbol);
    await page.waitForTimeout(500);

    // Click "Create custom" option (shows symbol + "Create custom (manual)")
    const createCustomOption = page.getByRole("option", {
      name: new RegExp(`${customBuy.customAsset.symbol}.*Create custom`, "i"),
    });
    await expect(createCustomOption).toBeVisible({ timeout: 5000 });
    await createCustomOption.click();

    // Fill custom asset dialog
    await expect(page.getByRole("heading", { name: "Create Custom Asset" })).toBeVisible();

    // Symbol should be pre-filled
    const symbolInput = page.locator('input[placeholder="e.g., MYCOIN"]');
    await expect(symbolInput).toHaveValue(customBuy.customAsset.symbol);

    // Fill name
    const nameInput = page.locator('input[placeholder="e.g., My Custom Coin"]');
    await nameInput.fill(customBuy.customAsset.name);

    // Select asset type
    const assetTypeSelect = page
      .locator("button")
      .filter({ hasText: /Security|Cryptocurrency|Other/i })
      .first();
    await assetTypeSelect.click();
    await page.getByRole("option", { name: customBuy.customAsset.assetType }).click();

    // Create the asset
    await page.getByRole("button", { name: "Create Asset" }).click();

    // Wait for dialog to close and symbol to be selected
    await expect(page.getByRole("heading", { name: "Create Custom Asset" })).not.toBeVisible({
      timeout: 10000,
    });
    await page.waitForTimeout(500);

    // Continue filling the activity form
    await selectDate();
    await fillQuantity(customBuy.quantity);
    await fillPrice(customBuy.price);
    await fillFee(customBuy.fee);
    await fillNotes(customBuy.notes);

    await submitActivity("Buy");
    await verifyActivityInTable("BUY", customBuy.customAsset.symbol, {
      quantity: customBuy.quantity,
    });
  });

  test("19. Verify all created assets in Securities page", async () => {
    await page.goto(`${BASE_URL}/settings/securities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Securities" })).toBeVisible({ timeout: 10000 });

    // Wait for table to load
    await page.waitForTimeout(1000);

    // Verify AAPL exists
    const aaplRow = page.getByRole("row").filter({ hasText: "AAPL" });
    await expect(aaplRow.first()).toBeVisible({ timeout: 10000 });

    // Verify MSFT exists
    const msftRow = page.getByRole("row").filter({ hasText: "MSFT" });
    await expect(msftRow.first()).toBeVisible({ timeout: 10000 });

    // Verify custom asset exists
    const customAssetRow = page
      .getByRole("row")
      .filter({ hasText: TEST_DATA.activities.customAssetBuy.customAsset.symbol });
    await expect(customAssetRow.first()).toBeVisible({ timeout: 10000 });
  });

  test("20. Verify custom asset has manual pricing", async () => {
    const customSymbol = TEST_DATA.activities.customAssetBuy.customAsset.symbol;

    // Navigate to the custom asset's profile page
    await page.goto(`${BASE_URL}/settings/securities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Securities" })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    // Find and click on the custom asset row to navigate to its profile
    const customAssetRow = page.getByRole("row").filter({ hasText: customSymbol });
    await expect(customAssetRow.first()).toBeVisible({ timeout: 10000 });

    // Click edit button for the custom asset
    const editButton = customAssetRow.first().getByRole("button").first();
    await editButton.click();

    // Wait for edit sheet to open
    await page.waitForTimeout(500);

    // Navigate to Market Data tab to check pricing mode
    const marketDataTab = page.getByRole("tab", { name: /Market Data/i });
    if (await marketDataTab.isVisible()) {
      await marketDataTab.click();
      await page.waitForTimeout(300);

      // Check if Manual pricing is enabled (switch should be checked or indicator visible)
      // Look for manual pricing indicator or toggle
      const manualPricingSwitch = page.locator('[role="switch"]').first();
      if (await manualPricingSwitch.isVisible()) {
        const isManual = await manualPricingSwitch.getAttribute("data-state");
        expect(isManual).toBe("checked");
      }
    }

    // Close the sheet
    const closeButton = page
      .getByRole("button", { name: /close/i })
      .or(page.locator('[aria-label="Close"]'));
    if (await closeButton.isVisible()) {
      await closeButton.click();
    } else {
      await page.keyboard.press("Escape");
    }
  });

  test("21. Verify activity count in activities page", async () => {
    await page.goto(`${BASE_URL}/activities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 10000 });

    // Wait for activities to load
    await page.waitForTimeout(1000);

    // Count activity rows - we created activities:
    // deposit, withdrawal, 2 buys, sell, 2 dividends,
    // internal transfer (creates 2), external transfer in, external transfer out, securities transfer (creates 2),
    // 1 fee, interest, 1 tax, split, custom buy
    // Total: 1 + 1 + 2 + 1 + 2 + 2 + 1 + 1 + 2 + 1 + 1 + 1 + 1 + 1 = 18
    const activityRows = page.locator("tbody tr");
    const rowCount = await activityRows.count();

    // We should have at least 18 activities
    expect(rowCount).toBeGreaterThanOrEqual(18);
  });
});
