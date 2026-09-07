import { createRoot } from "react-dom/client";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { FormattingProvider } from "@wealthfolio/ui";
import { PrivacyContext } from "@/context/privacy-context";
import de from "@/i18n/locales/de/insights.json";
import { BreakdownTable } from "@/pages/net-worth/components/breakdown-table";
import type { ParsedHistoryPoint, ParsedNetWorth } from "@/pages/net-worth/components/utils";
import "@/globals.css";

const data: ParsedNetWorth = {
  netWorth: 12_445_678,
  assets: {
    total: 12_745_678,
    breakdown: [
      { category: "investments", name: "Investments", value: 12_345_678 },
      { category: "properties", name: "Property with a long category name", value: 400_000 },
    ],
  },
  liabilities: {
    total: 300_000,
    breakdown: [{ category: "liabilities", assetId: "mortgage", name: "Mortgage", value: 300_000 }],
  },
};
const history: ParsedHistoryPoint[] = [
  {
    date: "2020-01-01",
    netWorth: 100,
    totalAssets: 100,
    totalLiabilities: 0,
    portfolioValue: 100,
    alternativeAssetsValue: 0,
    netContribution: 0,
    breakdown: { investments: 100, properties: 0, mortgage: 0 },
  },
  {
    date: "2026-09-06",
    netWorth: data.netWorth,
    totalAssets: data.assets.total,
    totalLiabilities: data.liabilities.total,
    portfolioValue: 12_345_678,
    alternativeAssetsValue: 400_000,
    netContribution: 0,
    breakdown: { investments: 12_345_678, properties: 400_000, mortgage: 300_000 },
  },
];

async function renderFixture() {
  await i18next.use(initReactI18next).init({
    lng: "de",
    resources: { de: { insights: de } },
    interpolation: { escapeValue: false },
  });
  createRoot(document.getElementById("root")!).render(
    <FormattingProvider locale="de-DE">
      <PrivacyContext.Provider
        value={{ isBalanceHidden: false, toggleBalanceVisibility: () => undefined }}
      >
        <main aria-label="Net worth card" style={{ padding: 16 }}>
          <BreakdownTable
            data={data}
            history={history}
            currency="EUR"
            periodLabel="ALL"
            onSelect={() => undefined}
          />
        </main>
      </PrivacyContext.Provider>
    </FormattingProvider>,
  );
}
void renderFixture();
