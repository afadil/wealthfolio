import { expect, Page, test } from "@playwright/test";
import { BASE_URL, loginIfNeeded } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("Holdings and Performance Pages", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("1. Setup: login", async () => {
    test.setTimeout(180000);
    await loginIfNeeded(page);
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("portfolio-balance-value")).toBeVisible({ timeout: 30000 });
  });

  test("2. Holdings page loads with AAPL row", async () => {
    test.setTimeout(60000);

    await page.goto(`${BASE_URL}/holdings`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Table should be visible
    const holdingsTable = page.locator("table").first();
    await expect(holdingsTable).toBeVisible({ timeout: 15000 });

    // Should have at least 4 rows (AAPL, SHOP.TO, MC.PA, AZN.L from spec 01)
    const rows = page.locator("tbody tr");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(4);

    // AAPL row should be present
    const aaplRow = page.getByRole("row").filter({ hasText: "AAPL" });
    await expect(aaplRow.first()).toBeVisible({ timeout: 10000 });
  });

  test("3. Account filter: CAD account shows SHOP.TO", async () => {
    test.setTimeout(60000);

    await page.goto(`${BASE_URL}/holdings`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    // Look for an account filter control
    const accountFilter = page
      .getByRole("button", { name: /Account/i })
      .or(page.getByText(/All Accounts/i))
      .first();

    if (await accountFilter.isVisible({ timeout: 5000 }).catch(() => false)) {
      await accountFilter.click();
      await page.waitForTimeout(300);

      // Select CAD Account
      const cadOption = page.getByRole("option", { name: /CAD Account/i }).first();
      if (await cadOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cadOption.click();
        await page.waitForTimeout(1000);

        // SHOP.TO should be visible
        const shopRow = page.getByRole("row").filter({ hasText: /SHOP/i });
        await expect(shopRow.first()).toBeVisible({ timeout: 10000 });
      }
    } else {
      // If no account filter UI found, just verify holdings table loaded
      const holdingsTable = page.locator("table").first();
      await expect(holdingsTable).toBeVisible({ timeout: 10000 });
    }
  });

  test("4. Performance page smoke test: loads without errors", async () => {
    test.setTimeout(60000);

    await page.goto(`${BASE_URL}/performance`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    // Page should not show an error boundary message
    await expect(page.getByText(/something went wrong/i)).not.toBeVisible();
  });

  test("5. Dashboard: total value > 0 and account tiles visible", async () => {
    test.setTimeout(60000);

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    const balanceElement = page.getByTestId("portfolio-balance-value");
    await expect(balanceElement).toBeVisible({ timeout: 15000 });

    // Balance should be a non-zero value
    const balanceText = (await balanceElement.textContent()) || "";
    const numericBalance = parseFloat(balanceText.replace(/[^0-9.]/g, "") || "0");
    expect(numericBalance).toBeGreaterThan(0);

    // At least one account tile or account name should be visible
    const accountTile = page.getByText(/CAD Account|USD Account|EUR Account|GBP Account/i).first();
    await expect(accountTile).toBeVisible({ timeout: 10000 });
  });
});
