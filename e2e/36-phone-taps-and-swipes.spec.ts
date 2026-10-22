import { expect, test, type Page } from "@playwright/test";
import { BASE_URL, completeOnboardingIfNeeded, gotoAppPath } from "./helpers";

const api = `${BASE_URL}/api/v1`;

async function newAccount(page: Page, name: string, accountType: "CASH" | "SECURITIES") {
  const response = await page.request.post(`${api}/accounts`, {
    data: {
      name,
      accountType,
      currency: "USD",
      isDefault: false,
      isActive: true,
      trackingMode: "TRANSACTIONS",
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const id = ((await response.json()) as { id: string }).id;
  const deposit = await page.request.post(`${api}/activities`, {
    data: {
      accountId: id,
      activityType: "DEPOSIT",
      activityDate: "2024-01-02T15:00:00Z",
      amount: 1000,
      currency: "USD",
      fee: 0,
      needsReview: false,
    },
  });
  expect(deposit.ok(), await deposit.text()).toBeTruthy();
  return id;
}

test("Next on the phone spending form opens the details instead of saving", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 393, height: 852 });
  await completeOnboardingIfNeeded(page);
  const accountId = await newAccount(page, `Spending next ${Date.now().toString(36)}`, "CASH");
  const withdrawals = async () =>
    (
      (await (
        await page.request.post(`${api}/activities/search`, {
          data: {
            page: 0,
            pageSize: 50,
            accountIdFilter: [accountId],
            activityTypeFilter: ["WITHDRAWAL"],
          },
        })
      ).json()) as { data: { amount: string }[] }
    ).data;

  // The form fills in the first spending account, so make it the only one.
  const previousSettings = await (await page.request.get(`${api}/spending/settings`)).json();
  try {
    const enroll = await page.request.put(`${api}/spending/settings`, {
      data: { enabled: true, accountIds: [accountId] },
    });
    expect(enroll.ok()).toBeTruthy();

    await gotoAppPath(page, "/activities?tab=spending");
    await page.getByRole("button", { name: "Add", exact: true }).filter({ visible: true }).click();
    const sheet = page.getByRole("dialog", { name: "Add Transaction" });
    await sheet.getByRole("button", { name: "Next", exact: true }).click();

    // The same footer slot becomes Create Transaction. Pressing Next used to press it too,
    // saving a withdrawal of 0 before an amount could be entered.
    const create = sheet.getByRole("button", { name: "Create Transaction", exact: true });
    await expect(create).toBeVisible();
    await expect(sheet).toBeVisible();
    expect(await withdrawals()).toEqual([]);

    await sheet.getByLabel("Amount", { exact: true }).fill("12.50");
    await create.click();
    await expect(sheet).toHaveCount(0);
    await expect
      .poll(async () => (await withdrawals()).map((w) => Number(w.amount)))
      .toEqual([12.5]);
  } finally {
    await page.request.put(`${api}/spending/settings`, { data: previousSettings });
  }
});

test("the Performance Plus button stays on screen next to two badges", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 393, height: 852 });
  await completeOnboardingIfNeeded(page);
  const name = `Performance badge ${Date.now().toString(36)}`;
  await newAccount(page, name, "SECURITIES");
  await gotoAppPath(page, "/insights?tab=performance");

  // All Portfolio is there by default; add the account as a second badge.
  const plus = page
    .getByRole("button", { name: "Add item", exact: true })
    .filter({ visible: true });
  await plus.click();
  await page.getByRole("menuitem", { name: "Add account", exact: true }).click();
  await page.getByRole("dialog").getByText(name, { exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Remove ${name}`, exact: true }).filter({ visible: true }),
  ).toBeVisible();

  for (const width of [360, 393, 412]) {
    await page.setViewportSize({ width, height: 852 });
    await expect(plus, `Plus button at ${width} px`).toBeInViewport({ ratio: 1 });
  }
});
