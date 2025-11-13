import { expect, Page, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.describe("Activity Forms Testing", () => {
  const BASE_URL = "http://localhost:1420";
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    // Navigate to activities once for all tests
    await page.goto(`${BASE_URL}/activities`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible({ timeout: 10000 });
  });

  test.afterAll(async () => {
    await page.close();
  });

  // Helper functions
  async function openActivityModal() {
    await page.getByRole("button", { name: "Add Activities" }).click();
    await page.getByRole("menuitem", { name: "Add Transaction" }).click();
    await expect(page.getByRole("heading", { name: "Add Activity" })).toBeVisible();
  }

  async function selectAccount(accountName: string = "Test") {
    const accountCombobox = page.getByLabel("Account");
    await accountCombobox.click();
    await page.getByRole("option", { name: new RegExp(`${accountName}.*CAD`) }).click();
    await expect(accountCombobox).toContainText(accountName);
  }

  async function enableCustomCurrency() {
    const currencyCheckbox = page.locator('label[for="use-different-currency-checkbox"]');
    await currencyCheckbox.click();
    // Wait for currency selector to appear
    await expect(page.getByLabel("Activity Currency")).toBeVisible();
  }

  async function getActivityCount() {
    const countText = await page
      .locator("text=/\\d+ \\/ \\d+ activities/")
      .first()
      .textContent();
    const match = countText?.match(/(\d+) \/ (\d+) activities/);
    return parseInt(match?.[2] || "0");
  }

  // Test Suite 1: Field Visibility
  test.describe("1. Field Visibility Tests", () => {
    test("1.1 - Trade Buy/Sell activity fields", async () => {
      await openActivityModal();

      // Trade tab is default, verify fields
      await expect(page.locator('label[for="BUY"]')).toBeVisible();
      await expect(page.locator('label[for="SELL"]')).toBeVisible();
      await expect(page.getByLabel("Symbol")).toBeVisible();
      await expect(page.getByLabel("Shares")).toBeVisible();
      await expect(page.getByLabel("Price")).toBeVisible();
      await expect(page.getByLabel("Fee")).toBeVisible();
      await expect(page.getByLabel("Account")).toBeVisible();
      await expect(page.getByLabel("Description")).toBeVisible();

      // Close modal
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });

    test("1.2 - Holdings Add/Remove activity fields", async () => {
      await openActivityModal();
      await page.getByRole("tab", { name: "Holdings" }).click();
      await page.waitForTimeout(200);

      await expect(page.locator('label[for="ADD_HOLDING"]')).toBeVisible();
      await expect(page.locator('label[for="REMOVE_HOLDING"]')).toBeVisible();
      await expect(page.getByLabel("Symbol")).toBeVisible();
      await expect(page.getByLabel("Shares")).toBeVisible();
      await expect(page.getByLabel("Average Cost")).toBeVisible();
      await expect(page.getByLabel("Account")).toBeVisible();

      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });

    test("1.3 - Cash activity fields (Deposit/Withdrawal/Transfer)", async () => {
      await openActivityModal();
      await page.getByRole("tab", { name: "Cash" }).click();
      await page.waitForTimeout(200);

      await expect(page.locator('label[for="DEPOSIT"]')).toBeVisible();
      await expect(page.locator('label[for="WITHDRAWAL"]')).toBeVisible();
      await expect(page.locator('label[for="TRANSFER_IN"]')).toBeVisible();
      await expect(page.locator('label[for="TRANSFER_OUT"]')).toBeVisible();
      await expect(page.getByLabel("Amount")).toBeVisible();
      await expect(page.getByLabel("Fee")).toBeVisible();
      await expect(page.getByLabel("Account")).toBeVisible();

      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });

    test("1.4 - Income Dividend fields", async () => {
      await openActivityModal();
      await page.getByRole("tab", { name: "Income" }).click();
      await page.waitForTimeout(200);
      await page.locator('label[for="DIVIDEND"]').click();

      await expect(page.getByLabel("Symbol")).toBeVisible();
      await expect(page.getByLabel("Dividend Amount")).toBeVisible();
      await expect(page.getByLabel("Account")).toBeVisible();
      // Fee should not be visible for Dividend
      await expect(page.getByLabel("Fee")).not.toBeVisible();

      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });

    test("1.5 - Income Interest fields", async () => {
      await openActivityModal();
      await page.getByRole("tab", { name: "Income" }).click();
      await page.waitForTimeout(200);
      await page.locator('label[for="INTEREST"]').click();

      // Symbol should not be visible for Interest
      await expect(page.getByLabel("Symbol")).not.toBeVisible();
      await expect(page.getByLabel("Interest Amount")).toBeVisible();
      await expect(page.getByLabel("Fee")).toBeVisible();
      await expect(page.getByLabel("Account")).toBeVisible();

      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });

    test("1.6 - Other Split fields", async () => {
      await openActivityModal();
      await page.getByRole("tab", { name: "Other" }).click();
      await page.waitForTimeout(200);
      await page.locator('label[for="SPLIT"]').click();

      await expect(page.getByLabel("Symbol")).toBeVisible();
      await expect(page.getByLabel("Split Ratio")).toBeVisible();
      await expect(page.getByLabel("Account")).toBeVisible();

      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });

    test("1.7 - Other Fee fields", async () => {
      await openActivityModal();
      await page.getByRole("tab", { name: "Other" }).click();
      await page.waitForTimeout(200);
      await page.locator('label[for="FEE"]').click();

      // Symbol should not be visible for Fee
      await expect(page.getByLabel("Symbol")).not.toBeVisible();
      await expect(page.getByLabel("Fee Amount")).toBeVisible();
      await expect(page.getByLabel("Account")).toBeVisible();

      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });

    test("1.8 - Other Tax fields", async () => {
      await openActivityModal();
      await page.getByRole("tab", { name: "Other" }).click();
      await page.waitForTimeout(200);
      await page.locator('label[for="TAX"]').click();

      // Symbol should not be visible for Tax
      await expect(page.getByLabel("Symbol")).not.toBeVisible();
      await expect(page.getByLabel("Tax Amount")).toBeVisible();
      await expect(page.getByLabel("Account")).toBeVisible();

      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });
  });

  // Test Suite 2: Custom Currency
  test.describe("2. Custom Currency Tests", () => {
    test("2.1 - Enable custom currency for Trade", async () => {
      await openActivityModal();

      // Trade tab is default
      await enableCustomCurrency();
      await expect(page.getByLabel("Activity Currency")).toBeVisible();

      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });

    test("2.2 - Enable custom currency for Cash", async () => {
      await openActivityModal();
      await page.getByRole("tab", { name: "Cash" }).click();
      await enableCustomCurrency();
      await expect(page.getByLabel("Activity Currency")).toBeVisible();

      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });

    test("2.3 - Enable custom currency for Income", async () => {
      await openActivityModal();
      await page.getByRole("tab", { name: "Income" }).click();
      await enableCustomCurrency();
      await expect(page.getByLabel("Activity Currency")).toBeVisible();

      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });

    test("2.4 - Create activity with USD custom currency", async () => {
      const initialCount = await getActivityCount();

      await openActivityModal();
      await page.getByRole("tab", { name: "Cash" }).click();
      await page.locator('label[for="DEPOSIT"]').click();

      // Enable custom currency
      await enableCustomCurrency();

      // Select USD currency
      const currencyInput = page.getByLabel("Activity Currency");
      await currencyInput.click();
      await page.getByRole("option", { name: /USD.*United States Dollar/ }).click();

      // Fill form
      await page.getByLabel("Amount").fill("1000");
      await selectAccount();
      await page.getByLabel("Description").fill("E2E test USD deposit");

      // Submit
      await page.getByRole("button", { name: /Add Activity/i }).last().click();
      await expect(page.getByRole("heading", { name: "Add Activity" })).not.toBeVisible({
        timeout: 10000,
      });

      // Verify count increased
      const newCount = await getActivityCount();
      expect(newCount).toBe(initialCount + 1);

      // Verify USD currency was used
      await expect(page.locator("text=/US\\$1,000\\.00/").first()).toBeVisible();
    });
  });

  // Test Suite 3: Form Validation
  test.describe("3. Form Validation Tests", () => {
    test("3.1 - Validate required activity type", async () => {
      await openActivityModal();
      await page.getByRole("tab", { name: "Cash" }).click();
      await page.waitForTimeout(200);

      // Fill amount without selecting activity type
      await page.getByLabel("Amount").fill("500");

      // Try to submit without selecting Deposit/Withdrawal type
      await page.getByRole("button", { name: /Add Activity/i }).last().click();

      // Verify validation error appears
      const depositLabel = page.locator('label[for="DEPOSIT"]');
      await expect(depositLabel).toHaveClass(/border-destructive/);

      // Select Deposit type to fix validation
      await depositLabel.click();
      await expect(page.locator('input[value="DEPOSIT"]')).toBeChecked();

      // Verify validation error styling is removed
      await expect(depositLabel).not.toHaveClass(/border-destructive/);

      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });

    test("3.2 - Verify account selection", async () => {
      await openActivityModal();
      await page.getByRole("tab", { name: "Cash" }).click();
      await page.waitForTimeout(200);

      // Click Account combobox to open options
      const accountCombobox = page.getByLabel("Account");
      await accountCombobox.click();

      // Verify Test (CAD) account appears as an option
      const testAccount = page.getByRole("option", { name: /Test.*CAD/ });
      await expect(testAccount).toBeVisible();

      // Verify clicking the option selects it
      await testAccount.click();
      await expect(accountCombobox).toContainText("Test");

      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    });
  });

  // Test Suite 4: Create All Activity Types
  test.describe("4. Create All Activity Types", () => {
    let initialCount: number;

    test.beforeAll(async () => {
      initialCount = await getActivityCount();
    });

    async function createActivity(
      tabName: string,
      activityType: string,
      fields: Record<string, string>,
    ) {
      await openActivityModal();
      const tab = page.getByRole("tab", { name: tabName });
      await tab.click();

      // Wait for tab content to load
      await expect(page.locator(`label[for="${activityType}"]`)).toBeVisible();
      await page.locator(`label[for="${activityType}"]`).click();

      // Handle symbol lookup checkbox if Symbol field is present
      if (fields.Symbol) {
        const symbolLookupCheckbox = page.locator('label[for="use-lookup-checkbox"]');
        const isChecked = await symbolLookupCheckbox
          .locator("..")
          .locator('input[type="checkbox"]')
          .isChecked();
        if (!isChecked) {
          await symbolLookupCheckbox.click();
          await page.waitForTimeout(200);
        }
      }

      // Fill in fields
      for (const [fieldName, value] of Object.entries(fields)) {
        if (fieldName === "account") {
          await selectAccount();
        } else if (fieldName === "description") {
          await page.getByLabel("Description").fill(value);
        } else if (fieldName === "Symbol") {
          const symbolInput = page.getByLabel("Symbol");
          await expect(symbolInput).toBeVisible();
          await symbolInput.fill(value);
          await page.waitForTimeout(300);
        } else {
          const input = page.getByLabel(fieldName);
          await expect(input).toBeVisible();
          await input.fill(value);
        }
      }

      // Submit
      await page.getByRole("button", { name: /Add Activity/i }).last().click();
      await expect(page.getByRole("heading", { name: "Add Activity" })).not.toBeVisible({
        timeout: 10000,
      });

      await page.waitForTimeout(500);
    }

    test("4.1 - Create Cash Deposit", async () => {
      await createActivity("Cash", "DEPOSIT", {
        Amount: "1500",
        account: "Test",
        description: "Test deposit",
      });

      const newCount = await getActivityCount();
      expect(newCount).toBeGreaterThan(initialCount);
      initialCount = newCount;
    });

    test("4.2 - Create Cash Withdrawal", async () => {
      await createActivity("Cash", "WITHDRAWAL", {
        Amount: "200",
        account: "Test",
        description: "Test withdrawal",
      });

      const newCount = await getActivityCount();
      expect(newCount).toBe(initialCount + 1);
      initialCount = newCount;
    });

    test("4.3 - Create Trade Buy", async () => {
      await createActivity("Trade", "BUY", {
        Symbol: "AAPL",
        Shares: "10",
        Price: "150",
        Fee: "5",
        account: "Test",
        description: "Test buy",
      });

      const newCount = await getActivityCount();
      expect(newCount).toBe(initialCount + 1);
      initialCount = newCount;
    });

    test("4.4 - Create Trade Sell", async () => {
      await createActivity("Trade", "SELL", {
        Symbol: "AAPL",
        Shares: "5",
        Price: "155",
        Fee: "5",
        account: "Test",
        description: "Test sell",
      });

      const newCount = await getActivityCount();
      expect(newCount).toBe(initialCount + 1);
      initialCount = newCount;
    });

    test("4.5 - Create Holdings Add", async () => {
      await createActivity("Holdings", "ADD_HOLDING", {
        Symbol: "MSFT",
        Shares: "20",
        "Average Cost": "200",
        account: "Test",
        description: "Test add holding",
      });

      const newCount = await getActivityCount();
      expect(newCount).toBe(initialCount + 1);
      initialCount = newCount;
    });

    test("4.6 - Create Holdings Remove", async () => {
      await createActivity("Holdings", "REMOVE_HOLDING", {
        Symbol: "MSFT",
        Shares: "5",
        "Average Cost": "200",
        account: "Test",
        description: "Test remove holding",
      });

      const newCount = await getActivityCount();
      expect(newCount).toBe(initialCount + 1);
      initialCount = newCount;
    });

    test("4.7 - Create Income Dividend", async () => {
      await createActivity("Income", "DIVIDEND", {
        Symbol: "AAPL",
        "Dividend Amount": "25",
        account: "Test",
        description: "Test dividend",
      });

      const newCount = await getActivityCount();
      expect(newCount).toBe(initialCount + 1);
      initialCount = newCount;
    });

    test("4.8 - Create Income Interest", async () => {
      await createActivity("Income", "INTEREST", {
        "Interest Amount": "50",
        Fee: "2",
        account: "Test",
        description: "Test interest",
      });

      const newCount = await getActivityCount();
      expect(newCount).toBe(initialCount + 1);
      initialCount = newCount;
    });

    test("4.9 - Create Other Split", async () => {
      await createActivity("Other", "SPLIT", {
        Symbol: "AAPL",
        "Split Ratio": "2",
        account: "Test",
        description: "Test split",
      });

      const newCount = await getActivityCount();
      expect(newCount).toBe(initialCount + 1);
      initialCount = newCount;
    });

    test("4.10 - Create Other Fee", async () => {
      await createActivity("Other", "FEE", {
        "Fee Amount": "10",
        account: "Test",
        description: "Test fee",
      });

      const newCount = await getActivityCount();
      expect(newCount).toBe(initialCount + 1);
      initialCount = newCount;
    });

    test("4.11 - Create Other Tax", async () => {
      await createActivity("Other", "TAX", {
        "Tax Amount": "30",
        account: "Test",
        description: "Test tax",
      });

      const newCount = await getActivityCount();
      expect(newCount).toBe(initialCount + 1);
      initialCount = newCount;
    });
  });
});
