import { expect, Page, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.describe("Onboarding And Main Flow", () => {
  const BASE_URL = "http://localhost:1420";
  const LOGIN_PASSWORD = "password001";
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
        price: 14082,
        priceInPence: true,
      },
    ],
  };

  const login = async (targetPage: Page) => {
    await targetPage.goto(BASE_URL, { waitUntil: "domcontentloaded" });

    const passwordInput = targetPage.getByPlaceholder("Enter your password");

    await expect(passwordInput).toBeVisible({ timeout: 10000 });
    await passwordInput.fill(LOGIN_PASSWORD);

    await targetPage.getByRole("button", { name: /Sign In/i }).click();

    await expect(targetPage).toHaveURL(
      new RegExp(`${BASE_URL}/(onboarding|dashboard|settings/accounts|$)`),
      { timeout: 15000 },
    );
  };

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("0. Login with test password", async () => {
    await login(page);
  });

  test("1. Complete onboarding with CAD currency and Light theme", async () => {
    // Navigate directly to onboarding
    await page.goto(`${BASE_URL}/onboarding`, { waitUntil: "domcontentloaded" });

    // Verify we're on the onboarding page
    await expect(page).toHaveURL(new RegExp(`${BASE_URL}/onboarding`));

    // Step 1: Welcome screen - just click Continue
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    // Wait for step 2 to load
    await page.waitForTimeout(300);

    // Step 2: Settings - Select CAD currency and Light theme
    await expect(page.locator('button:has-text("CAD")')).toBeVisible();

    // Select CAD currency
    const cadButton = page.locator('button:has-text("CAD")');
    await cadButton.click();
    // Verify CAD is selected (has primary styling)
    await expect(cadButton).toHaveClass(/border-primary/);

    // Select Light theme
    const lightThemeButton = page.locator('button:has-text("Light")');
    await expect(lightThemeButton).toBeVisible();
    await lightThemeButton.click();
    // Verify Light theme is selected
    await expect(lightThemeButton).toHaveClass(/border-primary/);

    // Click Continue (this submits the form)
    const continueButton = page.getByRole("button", { name: "Continue" });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    // Wait for step 3 to load
    await page.waitForTimeout(300);

    // Step 3: Checklist - click Get Started
    await expect(page.getByRole("button", { name: "Get Started" })).toBeVisible();
    await page.getByRole("button", { name: "Get Started" }).click();

    // Should navigate to accounts page after onboarding
    await expect(page).toHaveURL(new RegExp(`${BASE_URL}/settings/accounts`), {
      timeout: 10000,
    });
    await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
  });

  test("2. Create accounts (CAD, USD, EUR, GBP)", async () => {
    // Navigate to accounts page
    await page.goto(`${BASE_URL}/settings/accounts`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();

    for (const account of TEST_DATA.accounts) {
      // Find and click the "Add Account" button
      const addAccountButton = page.getByRole("button", { name: /Add Account/i });
      await expect(addAccountButton).toBeVisible();
      await addAccountButton.click();

      // Wait for account form dialog to appear
      await expect(page.getByRole("heading", { name: /Add Account/i })).toBeVisible();

      // Fill in account name
      const nameInput = page.getByLabel("Account Name");
      await expect(nameInput).toBeVisible();
      await nameInput.fill(account.name);

      // Select Currency
      const currencyInput = page.getByLabel("Currency");
      await expect(currencyInput).toBeVisible();

      const currentCurrency = await currencyInput.textContent();
      if (!currentCurrency?.includes(account.currency)) {
        await currencyInput.click();
        await page.waitForSelector('[role="listbox"], [role="option"]', {
          state: "visible",
          timeout: 5000,
        });

        // Construct regex for currency. The UI displays "Name (CODE)", e.g. "United States dollar (USD)"
        let currencyRegex;
        if (account.currency === "CAD") currencyRegex = /Canadian dollar \(CAD\)/;
        else if (account.currency === "USD") currencyRegex = /United States dollar \(USD\)/;
        else if (account.currency === "EUR") currencyRegex = /European Euro \(EUR\)/;
        else if (account.currency === "GBP") currencyRegex = /British pound \(GBP\)/;

        const option = page.getByRole("option", { name: currencyRegex }).first();
        await expect(option).toBeVisible({ timeout: 5000 });
        await option.click();
        await page.waitForTimeout(200);
      }

      // Submit the form
      const submitButton = page.getByRole("button", { name: /Add Account/i });
      await expect(submitButton).toBeVisible();
      await submitButton.click();

      // Wait for dialog to close
      await expect(page.getByRole("heading", { name: /Add Account/i })).not.toBeVisible({
        timeout: 10000,
      });

      // Verify account was created
      await expect(page.getByRole("link", { name: account.name }).first()).toBeVisible();
      await page.waitForTimeout(200);
    }
  });

  test("3. Deposit funds", async () => {
    // Navigate to activities page
    await page.goto(`${BASE_URL}/activities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 10000 });

    for (const deposit of TEST_DATA.deposits) {
      // Open Add Activities dropdown and select Add Transaction
      await page.getByRole("button", { name: "Add Activities" }).click();
      await page.getByRole("menuitem", { name: "Add Transaction" }).click();

      // Wait for modal to appear
      await expect(page.getByRole("heading", { name: "Add Activity" })).toBeVisible();

      // Click Cash tab
      const cashTab = page.getByRole("tab", { name: "Cash" });
      await expect(cashTab).toBeVisible();
      await cashTab.click();
      await page.waitForTimeout(200);

      // Select Deposit type
      await page.locator('label[for="DEPOSIT"]').click();
      await expect(page.locator('input[value="DEPOSIT"]')).toBeChecked();

      // Fill in amount
      await page.getByLabel("Amount").fill(String(deposit.amount));

      // Select Account
      const accountCombobox = page.getByLabel("Account");
      await accountCombobox.click();
      await page
        .getByRole("option", { name: new RegExp(`${deposit.account}.*${deposit.currency}`) })
        .first()
        .click();
      await expect(accountCombobox).toContainText(deposit.account);

      // Set date to earlier (Jan 1, 2025) so deposits are before buys
      const dateGroup = page.getByRole("group", { name: "Date" });
      await dateGroup.getByRole("spinbutton", { name: "month" }).fill("01");
      await dateGroup.getByRole("spinbutton", { name: "day" }).fill("01");
      await dateGroup.getByRole("spinbutton", { name: "year" }).fill("2025");

      // Fill description
      await page.getByLabel("Description").fill(`Initial deposit ${deposit.currency}`);

      // Submit the form
      await page
        .getByRole("button", { name: /Add Activity/i })
        .last()
        .click();

      // Wait for modal to close
      await expect(page.getByRole("heading", { name: "Add Activity" })).not.toBeVisible({
        timeout: 10000,
      });

      // Wait a bit for the table to update
      await page.waitForTimeout(500);
    }
  });

  test("4. Record buy securities", async () => {
    for (const trade of TEST_DATA.trades) {
      // Open Add Activities dropdown and select Add Transaction
      await page.getByRole("button", { name: "Add Activities" }).click();
      await page.getByRole("menuitem", { name: "Add Transaction" }).click();

      // Wait for modal to appear
      await expect(page.getByRole("heading", { name: "Add Activity" })).toBeVisible();

      // Trade tab is default selected
      await expect(page.getByRole("tab", { name: "Trade" })).toHaveAttribute(
        "data-state",
        "active",
      );

      // Select Buy type (default)
      await page.locator('label[for="BUY"]').click();
      await expect(page.locator('input[value="BUY"]')).toBeChecked();

      // Fill Symbol - it's a combobox with search
      const symbolCombobox = page.getByRole("combobox").filter({ hasText: "Select symbol" });
      await symbolCombobox.click();
      await page.waitForTimeout(200);

      // Type the symbol in the search input that appears
      await page.keyboard.type(trade.symbol);
      await page.waitForTimeout(500);

      // Wait for and click the matching option from the dropdown
      const symbolOption = page
        .getByRole("option", { name: new RegExp(trade.symbol, "i") })
        .first();
      await expect(symbolOption).toBeVisible({ timeout: 5000 });
      await symbolOption.click();
      await page.waitForTimeout(200);

      // Fill Shares
      await page.getByLabel("Shares").fill(String(trade.shares));

      // Fill Price
      await page.getByLabel("Price").fill(String(trade.price));

      // Select Account
      const accountCombobox = page.getByLabel("Account");
      await accountCombobox.click();
      await page
        .getByRole("option", { name: new RegExp(`${trade.account}.*${trade.currency}`) })
        .first()
        .click();

      // Fill description
      await page.getByLabel("Description").fill(`Buy ${trade.symbol}`);

      // Submit the form
      await page
        .getByRole("button", { name: /Add Activity/i })
        .last()
        .click();

      // Wait for modal to close
      await expect(page.getByRole("heading", { name: "Add Activity" })).not.toBeVisible({
        timeout: 10000,
      });

      await page.waitForTimeout(500);
    }
  });

  test("5. Check portfolio value calculation", async () => {
    // First, get exchange rates from settings -> general
    await page.goto(`${BASE_URL}/settings/general`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();

    // Extract exchange rates from the table (USD to CAD, EUR to CAD, GBP to CAD)
    // Find each currency row and get the rate from the Rate column
    const usdRow = page.getByRole("row", { name: /USD.*CAD/i });
    await expect(usdRow).toBeVisible();
    const usdRateCell = usdRow.getByRole("cell").nth(3); // Rate is 4th column
    const usdRateText = await usdRateCell.textContent();

    const eurRow = page.getByRole("row", { name: /EUR.*CAD/i });
    await expect(eurRow).toBeVisible();
    const eurRateCell = eurRow.getByRole("cell").nth(3); // Rate is 4th column
    const eurRateText = await eurRateCell.textContent();

    const gbpRow = page.getByRole("row", { name: /GBP.*CAD/i });
    await expect(gbpRow).toBeVisible();
    const gbpRateCell = gbpRow.getByRole("cell").nth(3); // Rate is 4th column
    const gbpRateText = await gbpRateCell.textContent();

    const usdToCAD = parseFloat(usdRateText?.trim() || "1.4");
    const eurToCAD = parseFloat(eurRateText?.trim() || "1.5");
    const gbpToCAD = parseFloat(gbpRateText?.trim() || "1.8");

    // Navigate to securities settings to get latest prices
    await page.goto(`${BASE_URL}/settings/securities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Securities" })).toBeVisible();

    // Extract prices for each security
    const prices: Record<string, number> = {};

    for (const trade of TEST_DATA.trades) {
      // Find the row by using getByRole for better specificity
      const row = page.getByRole("row", {
        name: new RegExp(`${trade.symbol}.*${trade.currency}`, "i"),
      });
      await expect(row).toBeVisible();

      // Get the price from the Last Close column (5th column)
      const priceCell = row.locator("td").nth(4);
      const priceText = await priceCell.textContent();

      // Extract numeric value (handles formats like "$277.55", "CA$223.77", "€628.60")
      const priceMatch = priceText?.match(/[\d,.]+/);
      prices[trade.symbol] = parseFloat(priceMatch?.[0]?.replace(",", "") || "0");
    }

    // Calculate expected portfolio value in CAD
    // Holdings value (current price * shares)
    // Note: London stocks prices are displayed in pence (GBp) in the app, need to convert to GBP
    const aaplValueCAD = prices["AAPL"] * TEST_DATA.trades[0].shares * usdToCAD;
    const shopValueCAD = prices["SHOP.TO"] * TEST_DATA.trades[1].shares; // Already in CAD
    const mcpaValueCAD = prices["MC.PA"] * TEST_DATA.trades[2].shares * eurToCAD;
    // AZN.L price is in pence, divide by 100 to get GBP
    const aznValueCAD = (prices["AZN.L"] / 100) * TEST_DATA.trades[3].shares * gbpToCAD;

    // Cash balances (deposit - trade cost for each currency)
    // Find deposit and trade for each currency
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
    // For GBP: trade price is in pence, so convert to GBP (divide by 100) for cash calculation
    const gbpTradeCost = gbpTrade.priceInPence
      ? (gbpTrade.shares * gbpTrade.price) / 100
      : gbpTrade.shares * gbpTrade.price;
    const cashGBP = gbpDeposit.amount - gbpTradeCost;

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

    const balanceElement = page.getByTestId("portfolio-balance-value");
    await expect(balanceElement).toBeVisible({ timeout: 15000 });
    const balanceText = await balanceElement.textContent();

    // Extract the displayed balance value
    const displayedBalance = parseFloat(balanceText?.replace(/[^0-9.]/g, "") || "0");

    // Verify the calculated value matches (with some tolerance for rounding)
    const tolerance = expectedTotalCAD * 0.01; // 1% tolerance
    expect(displayedBalance).toBeGreaterThan(expectedTotalCAD - tolerance);
    expect(displayedBalance).toBeLessThan(expectedTotalCAD + tolerance);

    // Also verify it's in CAD
    expect(balanceText).toMatch(/(?:CA\$|\$|C\$|CAD)/);
  });
});
