import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "react-i18next";

export function QuoteImportHelpPopover() {
  const { t } = useTranslation("settings");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="link" className="flex items-center gap-1 text-sm">
          <Icons.HelpCircle className="mr-1 h-5 w-5" />
          {t("marketData.import.help.buttonText")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="m-3 max-h-[min(80vh,520px)] w-[min(90vw,900px)] overflow-y-auto rounded-lg p-4 text-sm sm:m-4 sm:p-6">
        <h4 className="text-lg font-semibold">{t("marketData.import.help.title")}</h4>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          {/* Left Column - Instructions */}
          <div>
            <p className="text-muted-foreground mt-2 text-sm">
              {t("marketData.import.help.description")}
            </p>
            <ol className="mt-3 list-inside list-decimal space-y-1 text-sm">
              <li>{t("marketData.import.help.steps.step1")}</li>
              <li>{t("marketData.import.help.steps.step2")}</li>
              <li>{t("marketData.import.help.steps.step3")}</li>
              <li>{t("marketData.import.help.steps.step4")}</li>
            </ol>
            <div className="mt-4 space-y-3">
              <div className="rounded-md border border-blue-500 bg-blue-50 p-3 dark:border-blue-500/40 dark:bg-blue-900/40">
                <p className="text-sm">
                  <strong className="text-blue-700 dark:text-blue-300">
                    {t("marketData.import.help.tips.usage.title")}
                  </strong>{" "}
                  {t("marketData.import.help.tips.usage.text")}
                </p>
              </div>

              <div className="rounded-md border border-green-500 bg-green-50 p-3 dark:border-green-500/40 dark:bg-green-900/40">
                <p className="text-sm">
                  <strong className="text-green-700 dark:text-green-300">
                    {t("marketData.import.help.tips.requiredFields.title")}
                  </strong>{" "}
                  {t("marketData.import.help.tips.requiredFields.text")}
                </p>
              </div>

              <div className="rounded-md border border-purple-500 bg-purple-50 p-3 dark:border-purple-500/40 dark:bg-purple-900/40">
                <p className="text-sm">
                  <strong className="text-purple-700 dark:text-purple-300">
                    {t("marketData.import.help.tips.autoFormatting.title")}
                  </strong>{" "}
                  {t("marketData.import.help.tips.autoFormatting.text")}
                </p>
              </div>
            </div>
          </div>

          {/* Right Column - Examples and Reference */}
          <div>
            <div className="space-y-4">
              <div>
                <p className="font-semibold">{t("marketData.import.help.csvFormat.title")}</p>
                <pre className="bg-muted mt-2 overflow-x-auto rounded-md p-3 text-xs leading-relaxed select-all">
                  <span className="text-muted-foreground">
                    {t("marketData.import.help.csvFormat.comment1")}
                  </span>
                  <br />
                  <span className="text-muted-foreground">
                    {t("marketData.import.help.csvFormat.comment2")}
                  </span>
                  <br />
                  symbol,date,open,high,low,close,volume,currency
                  <br />
                  AAPL,2023-01-03,130.28,130.90,124.17,125.07,112117500,USD
                  <br />
                  MSFT,2023-01-03,243.08,245.75,237.40,239.58,25740000,USD
                  <br />
                  GOOGL,2023-01-03,89.59,91.05,88.52,89.12,28131200,USD
                  <br />
                  <br />
                  <span className="text-muted-foreground">
                    {t("marketData.import.help.csvFormat.comment3")}
                  </span>
                  <br />
                  AAPL,01/03/2023,130.28,130.90,124.17,125.07,112117500,USD
                  <br />
                  MSFT,3-Jan-2023,243.08,245.75,237.40,239.58,25740000,USD
                </pre>
              </div>

              <div>
                <p className="font-semibold">{t("marketData.import.help.validation.title")}</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                  <li>{t("marketData.import.help.validation.symbol")}</li>
                  <li>{t("marketData.import.help.validation.date")}</li>
                  <li>{t("marketData.import.help.validation.prices")}</li>
                  <li>{t("marketData.import.help.validation.currency")}</li>
                  <li>{t("marketData.import.help.validation.duplicates")}</li>
                </ul>
              </div>

              <div className="rounded-md border border-yellow-500 bg-yellow-50 p-3 dark:border-yellow-500/40 dark:bg-yellow-900/40">
                <p className="text-sm">
                  <strong className="text-yellow-700 dark:text-yellow-300">
                    {t("marketData.import.help.tips.important.title")}
                  </strong>{" "}
                  {t("marketData.import.help.tips.important.text")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
