import { expect, Page, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.describe("Onboarding And Main Flow", () => {
  const BASE_URL = "http://localhost:1420";
  const TEST_PASSWORD = "password001";
  let page: Page;

  // Test data - define once, use everywhere
  // Note: London stocks (*.L) are priced in pence, app auto-converts to GBP
  const TEST_DATA = {
    accounts: [
      { name: "CAD Account", currency: "CAD" },
      { name: "USD Account", currency: "USD" },
      { name: "EUR Account", currency: "EUR" },
      { name: "GBP Account", currency: "GBP" },
    ],
    deposits: [
      { account: "CAD Account", amount: 5000, currency: "CAD" },
      { account: "USD Account", amount: 5000, currency: "USD" },
      { account: "EUR Account", amount: 10000, currency: "EUR" },
      { account: "GBP Account", amount: 5000, currency: "GBP" },
    ],
    trades: [
      {
        account: "USD Account",
        currency: "USD",
        symbol: "AAPL",
        shares: 10,
        price: 150,
        priceInPence: false,
      },
      {
        account: "CAD Account",
        currency: "CAD",
        symbol: "SHOP.TO",
        shares: 10,
        price: 80,
        priceInPence: false,
      },
      {
        account: "EUR Account",
        currency: "EUR",
        symbol: "MC.PA",
        shares: 10,
        price: 700,
        priceInPence: false,
      },
      {
        account: "GBP Account",
        currency: "GBP",
        symbol: "AZN.L",
        shares: 17,
        price: 140.82, // Price in pounds (not pence) - the app expects account currency
        priceInPence: false,
      },
    ],
  };

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("1. Complete onboarding with CAD currency and Light theme", async () => {
    // Increase timeout for this test as it includes waiting for backend to start
    test.setTimeout(180000); // 3 minutes

    // Navigate to the app
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

    // The app might show login page first if auth is configured
    // Wait for either login page or onboarding to appear (backend must be ready)
    const loginInput = page.getByPlaceholder("Enter your password");
    const continueButton = page.getByRole("button", { name: "Continue" });

    // Wait for either login or onboarding to appear (up to 2 minutes for backend to start)
    await expect(loginInput.or(continueButton)).toBeVisible({ timeout: 120000 });

    // If login page is shown, enter password and sign in
    if (await loginInput.isVisible()) {
      await loginInput.fill(TEST_PASSWORD);
      await page.getByRole("button", { name: "Sign In" }).click();

      // Wait for redirect to onboarding after successful login
      await expect(page).toHaveURL(new RegExp(`${BASE_URL}/onboarding`), { timeout: 10000 });
    } else {
      // Already on onboarding page
      await expect(page).toHaveURL(new RegExp(`${BASE_URL}/onboarding`), { timeout: 5000 });
    }

    // Step 1: Info screen showing "Two ways to track your portfolio" - just click Continue
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Continue" }).click();

    // Wait for step 2 to load (currency and theme selection)
    const cadButton = page.getByRole("button", { name: "CAD", exact: true });
    await expect(cadButton).toBeVisible({ timeout: 5000 });

    // Step 2: Settings - Select CAD currency and Light theme
    await cadButton.click();
    // Verify CAD is selected (has border-primary styling)
    await expect(cadButton).toHaveClass(/border-primary/);

    // Select Light theme
    const lightThemeButton = page.getByRole("button", { name: "Light", exact: true });
    await expect(lightThemeButton).toBeVisible();
    await lightThemeButton.click();
    // Verify Light theme is selected
    await expect(lightThemeButton).toHaveClass(/border-primary/);

    // Click Continue (this submits the form)
    // Note: Step 2 saves settings with onboardingCompleted: true, which causes
    // the app to redirect to "/" instead of showing step 3
    const step2ContinueButton = page.getByRole("button", { name: "Continue" });
    await expect(step2ContinueButton).toBeEnabled();
    await step2ContinueButton.click();

    // Wait for step 3 to appear
    const getStartedButton = page.getByTestId("onboarding-finish-button");
    await expect(getStartedButton).toBeVisible({ timeout: 15000 });

    // Click "Get Started" to complete onboarding
    await getStartedButton.click();
    await expect(page).toHaveURL(new RegExp(`${BASE_URL}/settings/accounts`), {
      timeout: 10000,
    });

    await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible({ timeout: 10000 });
  });

  test("2. Create accounts (CAD, USD, EUR, GBP)", async () => {
    // Navigate to accounts page
    await page.goto(`${BASE_URL}/settings/accounts`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();

    for (const account of TEST_DATA.accounts) {
      // Find and click the "Add account" button (lowercase "a" in desktop view)
      const addAccountButton = page.getByRole("button", { name: /Add account/i });
      await expect(addAccountButton).toBeVisible();
      await addAccountButton.click();

      // Wait for account form dialog to appear
      await expect(page.getByRole("heading", { name: /Add Account/i })).toBeVisible();

      // Fill in account name
      const nameInput = page.getByLabel("Account Name");
      await expect(nameInput).toBeVisible();
      await nameInput.fill(account.name);

      // Select Currency using the CurrencyInput component
      const currencyTrigger = page.getByLabel("Currency");
      await expect(currencyTrigger).toBeVisible();

      // Check if the currency needs to be changed
      const currentCurrencyText = await currencyTrigger.textContent();
      if (!currentCurrencyText?.includes(account.currency)) {
        await currencyTrigger.click();
        await page.waitForSelector('[role="listbox"], [role="option"]', {
          state: "visible",
          timeout: 5000,
        });

        // Type to search for the currency
        const searchInput = page.getByPlaceholder("Search currency...");
        if (await searchInput.isVisible()) {
          await searchInput.fill(account.currency);
          await page.waitForTimeout(200);
        }

        // Click the matching option
        const option = page.getByRole("option", { name: new RegExp(account.currency) }).first();
        await expect(option).toBeVisible({ timeout: 5000 });
        await option.click();
        await page.waitForTimeout(200);
      }

      // Submit the form - button text is "Add Account"
      const submitButton = page.getByRole("button", { name: /Add Account/i }).last();
      await expect(submitButton).toBeVisible();
      await submitButton.click();

      // Wait for dialog to close
      await expect(page.getByRole("heading", { name: /Add Account/i })).not.toBeVisible({
        timeout: 10000,
      });

      // Wait for the list to refresh and show the new account
      // The account appears as a link in the account list
      await page.waitForTimeout(500);
      const accountLink = page.getByRole("link", { name: account.name });
      await expect(accountLink).toBeVisible({ timeout: 10000 });
    }
  });

  test("3. Deposit funds", async () => {
    // Navigate to activities page
    await page.goto(`${BASE_URL}/activities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 10000 });

    for (const deposit of TEST_DATA.deposits) {
      // Wait for any overlay/backdrop to disappear before opening new sheet
      await page.locator('[data-state="open"][aria-hidden="true"]').waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});

      // Open Add Activities dropdown and select Add Transaction
      await page.getByRole("button", { name: "Add Activities" }).click();
      await page.getByRole("menuitem", { name: "Add Transaction" }).click();

      // Wait for sheet to appear
      await expect(page.getByRole("heading", { name: "Add Activity" })).toBeVisible();

      // Select Deposit type from the activity type picker
      // The buttons have aria-pressed attribute when selected
      const depositButton = page.getByRole("button", { name: "Deposit", exact: true });
      await expect(depositButton).toBeVisible();
      await depositButton.click();
      await page.waitForTimeout(200);

      // Select Account using the AccountSelect component
      const accountSelect = page.locator('[aria-label="Account"]');
      await accountSelect.click();
      await page
        .getByRole("option", { name: new RegExp(`${deposit.account}.*\\(${deposit.currency}\\)`) })
        .first()
        .click();

      // Select a past date to avoid validation issues with "today" edge cases
      // The DatePicker's maxValue is today(), but default new Date() with time can cause validation errors
      const datePickerButton = page.getByRole("button", { name: "Pick a date" });
      await datePickerButton.click();
      // Wait for calendar popover
      await page.waitForSelector('[role="grid"]', { state: "visible", timeout: 5000 });
      // Click on day 15 (mid-month, always in the past for any date)
      const day15Button = page.getByRole("button", { name: /15,/i }).first();
      await day15Button.click();
      await page.waitForTimeout(200);

      // Fill in amount using click, clear, type (more reliable with MoneyInput component)
      const amountInput = page.getByLabel("Amount");
      await amountInput.click();
      await amountInput.press("Control+a");
      await amountInput.type(String(deposit.amount), { delay: 50 });
      await amountInput.blur();
      await page.waitForTimeout(200);

      // Fill notes/comment (optional)
      const notesInput = page.getByLabel("Notes");
      if (await notesInput.isVisible()) {
        await notesInput.click();
        await notesInput.type(`Initial deposit ${deposit.currency}`, { delay: 20 });
        await notesInput.blur();
      }
      await page.waitForTimeout(300);

      // Submit the form by clicking the button
      const submitButton = page.getByRole("button", { name: /Add Deposit/i });
      await expect(submitButton).toBeEnabled({ timeout: 5000 });
      await submitButton.click();

      // Wait for the activity to be added - look for sheet close
      await expect(page.getByRole("heading", { name: "Add Activity" })).not.toBeVisible({
        timeout: 20000,
      });

      // Wait a bit for the table to update
      await page.waitForTimeout(500);
    }
  });

  test("4. Record buy securities", async () => {
    // Navigate fresh to activities page to ensure no stale overlays
    await page.goto(`${BASE_URL}/activities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 10000 });

    for (const trade of TEST_DATA.trades) {
      // Wait for any overlay/backdrop to disappear before opening new sheet
      await page.waitForTimeout(500);

      // Open Add Activities dropdown and select Add Transaction
      await page.getByRole("button", { name: "Add Activities" }).click();
      await page.getByRole("menuitem", { name: "Add Transaction" }).click();

      // Wait for sheet to appear
      await expect(page.getByRole("heading", { name: "Add Activity" })).toBeVisible();

      // Select Buy type from the activity type picker
      const buyButton = page.getByRole("button", { name: "Buy", exact: true });
      await expect(buyButton).toBeVisible();
      await buyButton.click();
      await page.waitForTimeout(200);

      // Select Account
      const accountSelect = page.locator('[aria-label="Account"]');
      await accountSelect.click();
      await page
        .getByRole("option", { name: new RegExp(`${trade.account}.*\\(${trade.currency}\\)`) })
        .first()
        .click();

      // Select a past date to avoid validation issues with "today" edge cases
      const datePickerButton = page.getByRole("button", { name: "Pick a date" });
      await datePickerButton.click();
      await page.waitForSelector('[role="grid"]', { state: "visible", timeout: 5000 });
      const day15Button = page.getByRole("button", { name: /15,/i }).first();
      await day15Button.click();
      await page.waitForTimeout(200);

      // Fill Symbol - click the combobox trigger to open search
      const symbolCombobox = page.getByRole("combobox").filter({ hasText: /Select symbol/i });
      await symbolCombobox.click();
      await page.waitForTimeout(200);

      // Type the symbol in the search input
      const searchInput = page.getByPlaceholder("Search for symbol");
      await searchInput.fill(trade.symbol);
      await page.waitForTimeout(500);

      // Wait for and click the matching option from the dropdown
      const symbolOption = page
        .getByRole("option", { name: new RegExp(trade.symbol, "i") })
        .first();
      await expect(symbolOption).toBeVisible({ timeout: 5000 });
      await symbolOption.click();
      await page.waitForTimeout(200);

      // Fill Quantity and blur to trigger validation
      const quantityInput = page.getByLabel("Quantity");
      await quantityInput.fill(String(trade.shares));
      await quantityInput.blur();

      // Fill Price and blur
      const priceInput = page.getByLabel("Price");
      await priceInput.fill(String(trade.price));
      await priceInput.blur();

      // Fill notes/comment (optional) - use specific placeholder to avoid ambiguity
      const notesInput = page.getByPlaceholder("Add an optional note...");
      if (await notesInput.isVisible()) {
        await notesInput.fill(`Buy ${trade.symbol}`);
        await notesInput.blur();
      }

      // Wait for form to settle and validation to complete
      await page.waitForTimeout(300);

      // Submit the form
      const submitButton = page.getByRole("button", { name: /Add Buy/i });
      await expect(submitButton).toBeEnabled({ timeout: 5000 });
      await submitButton.click();

      // Wait for sheet to close
      await expect(page.getByRole("heading", { name: "Add Activity" })).not.toBeVisible({
        timeout: 20000,
      });

      await page.waitForTimeout(500);
    }
  });

  test("5. Check portfolio value calculation", async () => {
    // Increase timeout for this test as it involves multiple page navigations
    test.setTimeout(120000);

    // Helper: wait for market sync and portfolio calculation to complete
    // The app shows toast messages during sync - wait for them to disappear
    const waitForSyncComplete = async () => {
      // Wait for "Syncing market data..." toast to disappear (if visible)
      const syncToast = page.getByText("Syncing market data...");
      if (await syncToast.isVisible().catch(() => false)) {
        await expect(syncToast).not.toBeVisible({ timeout: 30000 });
      }

      // Wait for "Calculating portfolio..." toast to disappear (if visible)
      const calcToast = page.getByText("Calculating portfolio");
      if (await calcToast.isVisible().catch(() => false)) {
        await expect(calcToast).not.toBeVisible({ timeout: 30000 });
      }

      // Small delay to ensure data is fully updated
      await page.waitForTimeout(500);
    };

    // Wait for any ongoing sync to complete before starting
    await waitForSyncComplete();

    // First, get exchange rates from settings -> general
    await page.goto(`${BASE_URL}/settings/general`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible({ timeout: 10000 });

    // Wait for any sync to complete before reading rates
    await waitForSyncComplete();

    // Wait for exchange rates table to load
    await page.waitForTimeout(1000);

    // Extract exchange rates from the table (USD to CAD, EUR to CAD, GBP to CAD)
    const usdRow = page.getByRole("row", { name: /USD.*CAD/i });
    await expect(usdRow).toBeVisible({ timeout: 10000 });
    const usdRateCell = usdRow.getByRole("cell").nth(3);
    const usdRateText = await usdRateCell.textContent();

    const eurRow = page.getByRole("row", { name: /EUR.*CAD/i });
    await expect(eurRow).toBeVisible({ timeout: 10000 });
    const eurRateCell = eurRow.getByRole("cell").nth(3);
    const eurRateText = await eurRateCell.textContent();

    const gbpRow = page.getByRole("row", { name: /GBP.*CAD/i });
    await expect(gbpRow).toBeVisible({ timeout: 10000 });
    const gbpRateCell = gbpRow.getByRole("cell").nth(3);
    const gbpRateText = await gbpRateCell.textContent();

    const usdToCAD = parseFloat(usdRateText?.trim() || "1.4");
    const eurToCAD = parseFloat(eurRateText?.trim() || "1.5");
    const gbpToCAD = parseFloat(gbpRateText?.trim() || "1.8");

    // Navigate to securities settings to get latest prices
    await page.goto(`${BASE_URL}/settings/securities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Securities" })).toBeVisible({ timeout: 10000 });

    // Wait for any sync to complete before reading prices
    await waitForSyncComplete();

    // Wait for securities table to load
    await page.waitForTimeout(1000);

    // Extract prices for each security
    const prices: Record<string, number> = {};

    for (const trade of TEST_DATA.trades) {
      // Symbols in the table are displayed without exchange suffix (SHOP.TO -> SHOP, MC.PA -> MC)
      const baseSymbol = trade.symbol.split(".")[0];
      // Note: For LSE stocks, the asset currency is "GBp" (pence), not "GBP" (pounds)
      const assetCurrency = trade.symbol.endsWith(".L") ? "GBp" : trade.currency;
      const row = page.getByRole("row").filter({ hasText: baseSymbol }).filter({ hasText: assetCurrency });
      await expect(row.first()).toBeVisible({ timeout: 15000 });

      // Get the price from the Quote column (td[0]=symbol, td[1]=market, td[2]=quote, td[3]=actions)
      const priceCell = row.first().locator("td").nth(2);
      const priceText = await priceCell.textContent();

      // Extract numeric value (handles formats like "$277.55", "CA$223.77", "€570.00", "£13,520.00")
      const priceMatch = priceText?.match(/[\d,.]+/);
      prices[trade.symbol] = parseFloat(priceMatch?.[0]?.replace(",", "") || "0");

    }

    // Calculate expected portfolio value in CAD
    // Holdings value (current price * shares)
    const aaplValueCAD = prices["AAPL"] * TEST_DATA.trades[0].shares * usdToCAD;
    const shopValueCAD = prices["SHOP.TO"] * TEST_DATA.trades[1].shares; // Already in CAD
    const mcpaValueCAD = prices["MC.PA"] * TEST_DATA.trades[2].shares * eurToCAD;

    // AZN.L: The displayed price is in pence (GBp), e.g., "£13,520.00" = 13520 pence
    // The app normalizes this to GBP (x0.01) when calculating holdings value
    // We must apply the same normalization to match the app's calculation
    const aznPriceInGBP = prices["AZN.L"] / 100; // Convert pence to pounds
    const aznValueCAD = aznPriceInGBP * TEST_DATA.trades[3].shares * gbpToCAD;

    // Cash balances (deposit - trade cost for each currency)
    const cadDeposit = TEST_DATA.deposits.find((d) => d.currency === "CAD")!;
    const usdDeposit = TEST_DATA.deposits.find((d) => d.currency === "USD")!;
    const eurDeposit = TEST_DATA.deposits.find((d) => d.currency === "EUR")!;
    const gbpDeposit = TEST_DATA.deposits.find((d) => d.currency === "GBP")!;

    const cadTrade = TEST_DATA.trades.find((t) => t.currency === "CAD")!;
    const usdTrade = TEST_DATA.trades.find((t) => t.currency === "USD")!;
    const eurTrade = TEST_DATA.trades.find((t) => t.currency === "EUR")!;
    const gbpTrade = TEST_DATA.trades.find((t) => t.currency === "GBP")!;

    const cashCAD = cadDeposit.amount - cadTrade.shares * cadTrade.price;
    const cashUSD = usdDeposit.amount - usdTrade.shares * usdTrade.price;
    const cashEUR = eurDeposit.amount - eurTrade.shares * eurTrade.price;

    // For GBP: The trade was entered in pence (14082), so cost = shares * price_in_pence / 100
    const gbpTradeCostInGBP = gbpTrade.priceInPence
      ? (gbpTrade.shares * gbpTrade.price) / 100
      : gbpTrade.shares * gbpTrade.price;
    const cashGBP = gbpDeposit.amount - gbpTradeCostInGBP;

    const cashUSDinCAD = cashUSD * usdToCAD;
    const cashEURinCAD = cashEUR * eurToCAD;
    const cashGBPinCAD = cashGBP * gbpToCAD;

    const expectedTotalCAD =
      aaplValueCAD +
      shopValueCAD +
      mcpaValueCAD +
      aznValueCAD +
      cashCAD +
      cashUSDinCAD +
      cashEURinCAD +
      cashGBPinCAD;

    // Navigate to dashboard and verify portfolio value
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });

    // Wait for any sync to complete before reading dashboard value
    await waitForSyncComplete();

    const balanceElement = page.getByTestId("portfolio-balance-value");
    await expect(balanceElement).toBeVisible({ timeout: 15000 });
    const balanceText = await balanceElement.textContent();

    // Extract the displayed balance value
    const displayedBalance = parseFloat(balanceText?.replace(/[^0-9.]/g, "") || "0");

    // Verify the portfolio value matches our calculation within 0.1% tolerance
    // This accounts for minor rounding differences in decimal calculations
    const tolerance = 0.001;
    const lowerBound = expectedTotalCAD * (1 - tolerance);
    const upperBound = expectedTotalCAD * (1 + tolerance);

    expect(displayedBalance).toBeGreaterThanOrEqual(lowerBound);
    expect(displayedBalance).toBeLessThanOrEqual(upperBound);

    // Also verify it's in CAD
    expect(balanceText).toMatch(/(?:CA\$|\$|C\$|CAD)/);
  });
});
