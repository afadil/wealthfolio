import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useTranslation } from "react-i18next";

interface UnconvertedCurrenciesNoticeProps {
  currencies: string[];
  baseCurrency: string;
}

/** Names the currencies whose income the totals leave out for lack of an exchange rate. */
export function UnconvertedCurrenciesNotice({
  currencies,
  baseCurrency,
}: UnconvertedCurrenciesNoticeProps) {
  const { t, i18n } = useTranslation();

  if (currencies.length === 0) return null;

  return (
    <div className="border-warning/30 bg-warning/5 flex items-start gap-2 rounded-md border px-3 py-2">
      <Icons.AlertTriangle className="text-warning mt-0.5 h-4 w-4 shrink-0" />
      <p className="text-sm">
        {t("income:unconverted_currencies", {
          count: currencies.length,
          currencies: new Intl.ListFormat(i18n.language).format(currencies),
          baseCurrency,
        })}
      </p>
    </div>
  );
}
