import { expect, Page, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.describe("Onboarding Flow", () => {
  const BASE_URL = "http://localhost:1420";
  const LOGIN_PASSWORD = "password001";
  let page: Page;
  const DEPOSIT_AMOUNT = "5000";

  const login = async (targetPage: Page) => {
    await targetPage.goto(BASE_URL, { waitUntil: "domcontentloaded" });

    const passwordInput = targetPage.getByPlaceholder("Enter your password");
    await expect(passwordInput).toBeVisible({ timeout: 10000 });
    await passwordInput.fill(LOGIN_PASSWORD);

    await targetPage.getByRole("button", { name: /Sign In/i }).click();

    await expect(targetPage).toHaveURL(
      new RegExp(`${BASE_URL}/(onboarding|dashboard|settings/accounts)`),
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

  test("2. Create Test account with CAD currency", async () => {
    // Navigate to accounts page
    await page.goto(`${BASE_URL}/settings/accounts`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();

    // Find and click the "Add Account" button
    const addAccountButton = page.getByRole("button", { name: /Add Account/i });
    await expect(addAccountButton).toBeVisible();
    await addAccountButton.click();

    // Wait for account form dialog to appear
    await expect(page.getByRole("heading", { name: /Add Account/i })).toBeVisible();

    // Fill in account name
    const nameInput = page.getByLabel("Account Name");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Test");

    // Select CAD currency - CurrencyInput is a combobox
    const currencyInput = page.getByLabel("Currency");
    await expect(currencyInput).toBeVisible();

    // Check if CAD is already selected (it should be since we set it in onboarding)
    const currencyValue = await currencyInput.textContent();
    if (!currencyValue?.includes("CAD")) {
      // If not CAD, click to open and select it
      await currencyInput.click();
      // Wait for the popover/content to appear - look for the command list
      await page.waitForSelector('[role="listbox"], [role="option"]', {
        state: "visible",
        timeout: 5000,
      });
      // Search for CAD or select from list
      const cadOption = page.getByRole("option", { name: /CAD.*Canadian Dollar/i });
      await expect(cadOption).toBeVisible({ timeout: 5000 });
      await cadOption.click();
      // Wait for selection to complete
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

    // Verify account was created - should see "Test" account
    await expect(page.getByRole("link", { name: "Test" }).first()).toBeVisible();

    // Wait for data to persist
    await page.waitForTimeout(500);
  });

  test("3. Create initial cash deposit", async () => {
    // Navigate to activities page
    await page.goto(`${BASE_URL}/activities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 10000 });

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
    await page.getByLabel("Amount").fill(DEPOSIT_AMOUNT);

    // Select Test account
    const accountCombobox = page.getByLabel("Account");
    await accountCombobox.click();
    await page.getByRole("option", { name: /Test.*CAD/ }).click();
    await expect(accountCombobox).toContainText("Test");

    // Fill description
    await page.getByLabel("Description").fill("Initial deposit");

    // Submit the form
    await page
      .getByRole("button", { name: /Add Activity/i })
      .last()
      .click();

    // Wait for modal to close
    await expect(page.getByRole("heading", { name: "Add Activity" })).not.toBeVisible({
      timeout: 10000,
    });

    // Verify we're back on Activities page
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();

    // Verify the deposit appears (CA$5,000.00)
    await expect(page.locator("text=/CA\\$5,000\\.00/").first()).toBeVisible();

    // Wait for data to persist
    await page.waitForTimeout(1000);
  });

  test("4. Verify portfolio balance on dashboard", async () => {
    // Navigate to dashboard
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });

    // The total portfolio value should match the deposit amount
    // Look for the balance display - it should show CA$5,000.00
    const balanceElement = page.getByTestId("portfolio-balance-value");
    await expect(balanceElement).toBeVisible({ timeout: 15000 });

    // Get the text content
    const balanceText = await balanceElement.textContent();

    // Verify it contains 5,000
    expect(balanceText).toContain("5,000");

    // Verify currency symbol (CA$ for CAD)
    expect(balanceText).toMatch(/(?:CA\$|\$|C\$|CAD)/);
  });
});
