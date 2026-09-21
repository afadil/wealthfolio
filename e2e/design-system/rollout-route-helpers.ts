import type { Page } from "@playwright/test";

export async function mockRolloutRoutes(page: Page, themeId: string, mode: string) {
  const unexpected: string[] = [];
  let settings = {
    themeId,
    theme: mode,
    font: "font-sans",
    language: "en",
    formattingRegion: "US",
    baseCurrency: "USD",
    defaultReturnMetric: "twr",
    timezone: "UTC",
    onboardingCompleted: true,
    autoUpdateCheckEnabled: false,
    menuBarVisible: true,
    syncEnabled: false,
  };
  const account = {
    id: "synthetic-account",
    name: "Investment account",
    currency: "USD",
    isActive: true,
    isArchived: false,
    accountType: "SECURITIES",
    accountPurpose: "INVESTMENT",
    trackingMode: "TRANSACTIONS",
    group: "Securities",
  };
  const holding = {
    id: "ACME",
    holdingType: "security",
    assetKind: "INVESTMENT",
    accountId: account.id,
    quantity: 120,
    instrument: {
      id: "ACME",
      symbol: "ACME",
      name: "Acme Global Equity",
      currency: "USD",
      quoteMode: "MARKET",
      classifications: { assetType: { id: "stock", key: "STOCK", name: "Stock" } },
    },
    localCurrency: "USD",
    baseCurrency: "USD",
    marketValue: { local: 48230.4, base: 48230.4 },
    costBasis: { local: 47000, base: 47000 },
    price: 401.92,
    dayChange: { local: 1230.4, base: 1230.4 },
    dayChangePct: 0.025,
    unrealizedGain: { local: 1230.4, base: 1230.4 },
    unrealizedGainPct: 0.025,
    totalGain: { local: 1230.4, base: 1230.4 },
    totalGainPct: 0.025,
    weight: 1,
    asOfDate: "2026-09-07",
    fxRate: 1,
    openDate: "2026-01-15",
  };
  const activity = {
    id: "synthetic-buy",
    activityType: "BUY",
    date: "2026-09-07T12:00:00Z",
    createdAt: "2026-09-07T12:00:00Z",
    updatedAt: "2026-09-07T12:00:00Z",
    quantity: "120",
    unitPrice: "391.66666667",
    amount: "47000",
    fee: "0",
    currency: "USD",
    needsReview: false,
    assetId: "ACME",
    accountId: account.id,
    accountName: account.name,
    accountCurrency: "USD",
    assetSymbol: "ACME",
    assetName: "Acme Global Equity",
  };
  const performance = {
    scope: { id: "portfolio:all", currency: "USD" },
    period: { startDate: "2026-06-07", endDate: "2026-09-07" },
    mode: "timeWeighted",
    returns: { twr: 0.02618 },
    attribution: {
      contributions: 47000,
      distributions: 0,
      income: 0,
      realizedPnl: 0,
      unrealizedPnlChange: 1230.4,
      fxEffect: 0,
      fees: 0,
      taxes: 0,
      residual: 0,
    },
    risk: {},
    dataQuality: { status: "ok", warnings: [] },
    summary: {
      amount: 1230.4,
      percent: 0.02618,
      method: "timeWeighted",
      basis: "marketValue",
      quality: "ok",
      amountStatus: "complete",
      percentStatus: "complete",
      basisStatus: "complete",
      reasons: [],
    },
    series: [],
  };
  const valuations = [47000, 47500, 47250, 48100, 47800, 48230.4].map((value, index) => ({
    accountId: account.id,
    valuationDate: `2026-09-0${index + 2}`,
    accountCurrency: "USD",
    baseCurrency: "USD",
    fxRateToBase: 1,
    cashBalance: 0,
    investmentMarketValue: value,
    totalValue: value,
    cashBalanceBase: 0,
    investmentMarketValueBase: value,
    totalValueBase: value,
    netContributionBase: 47000,
    sourceDataAsOf: "2026-09-07",
    calculatedAt: "2026-09-07",
    warnings: [],
  }));
  const allocation = {
    taxonomyId: "synthetic",
    taxonomyName: "Synthetic",
    color: "",
    categories: [],
  };
  const responses: Record<string, unknown> = {
    "/net-worth": {
      date: "2026-09-07",
      currency: "USD",
      netWorth: "48230.4",
      assets: { total: "48230.4", breakdown: [] },
      liabilities: { total: "0", breakdown: [] },
      staleAssets: [],
    },
    "/net-worth/history": [],
    "/allocations/query": {
      assetClasses: allocation,
      sectors: allocation,
      regions: allocation,
      riskCategory: allocation,
      securityTypes: allocation,
      customGroups: [],
      totalValue: 48230.4,
    },
    "/spending/events": [],
    "/spending/event-types": [],
    "/spending/cash-activities/search": { items: [], totalCount: 0, baseCurrency: "USD" },
    "/taxonomies/spending_categories": { id: "spending_categories", categories: [] },
    "/taxonomies/income_sources": { id: "income_sources", categories: [] },
    "/taxonomies/savings_categories": { id: "savings_categories", categories: [] },
    "/spending/cash-activities": [],
    "/spending/event-spending-summaries": [],
    "/spending/insight": {
      period: {
        start: "2026-09-01T00:00:00Z",
        end: "2026-09-30T23:59:59Z",
        months: ["2026-09"],
        dayCount: 30,
      },
      prior: {
        start: "2026-08-01T00:00:00Z",
        end: "2026-08-31T23:59:59Z",
        months: ["2026-08"],
        dayCount: 31,
      },
      currency: "USD",
      headline: {
        spent: 400,
        income: 2000,
        saved: 300,
        netCashflow: 1600,
        budget: 1500,
        remaining: 1100,
        priorSpent: 500,
        deltaVsPriorPct: -0.2,
        pace: {
          dailyAvg: 20,
          daysElapsed: 7,
          daysRemaining: 23,
          projectedSpend: 860,
          expectedSpendToDate: 350,
        },
        status: "on_track",
      },
      groups: [],
      uncategorized: {
        spent: 400,
        priorSpent: 500,
        deltaVsPriorPct: -0.2,
        pctOfTotalSpent: 1,
        txnCount: 1,
      },
      incomeBreakdown: [],
      savingsBreakdown: [],
      byDay: [{ date: "2026-09-07", spent: 400, income: 2000 }],
      byDayByCategory: [],
      byMonth: [{ month: "2026-09", spent: 400, income: 2000, saved: 300 }],
    },
    "/performance/summaries": {
      "accounts:synthetic-account": performance,
      "accounts:synthetic-account,synthetic-cash": performance,
    },
    "/taxonomies": [],
    "/alternative-holdings": [],
    "/portfolio/update": null,
    "/goals": [],
    "/valuations/history/query": valuations,
    "/settings/auto-update-enabled": false,
    "/app/check-update": null,
    "/auth/status": { requiresPassword: false, oidcEnabled: false },
    "/accounts": [
      account,
      { ...account, id: "synthetic-cash", name: "Everyday account", accountType: "CASH" },
    ],
    "/portfolios": [],
    "/assets/logos": [],
    "/addons/installed": [],
    "/addons/enabled-on-startup": [],
    "/secrets": null,
    "/connect/session/status": { hasSession: false },
    // Profile startup: every data request is refused (PROFILE_LOCKED) until the app is
    // admitted into a profile. One unlocked profile with a matching session admits it;
    // the app re-polls this, so the answer must stay stable.
    // Connect's per-profile sign-in storage. null means no pending sign-in and no stored
    // verifier; its set/validate operations only run mid-login, which tests never start.
    "/profiles/profile_auth_storage": null,
    // Idle-lock heartbeat sent on any real click, key, touch or scroll. A failed heartbeat
    // revokes the session, so any spec that clicks needs it to succeed.
    "/profiles/profile_activity": null,
    "/profiles/get_profile_state": {
      profiles: [
        { id: "synthetic-profile", name: "Synthetic", avatarId: "default", lockEnabled: false },
      ],
      session: { profileId: "synthetic-profile", scopeId: "synthetic-scope" },
      starting: false,
    },
    "/spending/settings": { enabled: true, accountIds: ["synthetic-cash"], currency: "USD" },
    "/holdings/list/query": [holding],
    "/holdings/query": [holding],
    "/activities/search": {
      data: [activity],
      meta: { totalRowCount: 1 },
      activities: [activity],
      totalCount: 1,
      total: 1,
      page: 1,
      pageSize: 50,
    },
    "/health/status": {
      issueCounts: {},
      overallSeverity: "INFO",
      checkedAt: "2026-09-07",
      isStale: false,
      issues: [],
      totalIssues: 0,
      score: 100,
      status: "healthy",
      lastCheckedAt: "2026-09-07T12:00:00Z",
    },
    "/valuations/current/query": {
      summary: {
        scopeId: "all",
        baseCurrency: "USD",
        cashBalanceBase: 0,
        investmentMarketValueBase: 48230.4,
        totalValueBase: 48230.4,
        holdingsCount: 1,
        accountCount: 1,
        currencySplit: [],
        cashCurrencySplit: [],
        sourceDataAsOf: "2026-09-07",
        calculatedAt: "2026-09-07",
        warnings: [],
      },
      accounts: [valuations[valuations.length - 1]],
    },
    "/valuations/history": valuations,
    "/valuations/latest": [],
    "/performance/summary": performance,
    "/ai/providers": {
      providers: [
        {
          id: "synthetic",
          name: "Synthetic Provider",
          type: "local",
          icon: "",
          description: "Synthetic browser fixture",
          envKey: "",
          connectionFields: [],
          defaultModel: "synthetic-model",
          documentationUrl: "",
          enabled: true,
          favorite: true,
          priority: 0,
          favoriteModels: ["synthetic-model"],
          modelCapabilityOverrides: {},
          toolsAllowlist: [],
          hasApiKey: false,
          isDefault: true,
          supportsModelListing: false,
          models: [
            {
              id: "synthetic-model",
              name: "Synthetic Model",
              capabilities: {},
              isCatalog: true,
              isFavorite: true,
              hasCapabilityOverrides: false,
            },
          ],
        },
      ],
      capabilities: {},
      defaultProvider: "synthetic",
    },
    "/ai/threads": { threads: [], nextCursor: null, hasMore: false },
  };
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://localhost:1434") {
      unexpected.push(`FOREIGN ${url.origin}${url.pathname}`);
      return route.abort();
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname.replace("/api/v1", "");
    if (path === "/events/stream")
      return route.fulfill({ contentType: "text/event-stream", body: ": synthetic stream\n\n" });
    // The connect provider probes for a backend session on boot. A null body
    // leaves it with nothing to restore — which it already handles — without a
    // 401, which trips the adapter's unauthorized path and tears down queries.
    if (path === "/connect/session/restore") return route.fulfill({ json: null });
    if (path === "/settings") {
      if (route.request().method() === "PUT")
        settings = { ...settings, ...route.request().postDataJSON() };
      return route.fulfill({ json: settings });
    }
    if (path in responses) return route.fulfill({ json: responses[path] });
    unexpected.push(`${route.request().method()} ${path}`);
    return route.abort("blockedbyclient");
  });
  return { unexpected };
}
