import { Icons } from "@wealthfolio/ui/components/ui/icons";

import { Button } from "@wealthfolio/ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@wealthfolio/ui/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui/components/ui/tabs";
import { usePlatform } from "@/hooks/use-platform";
import {
  ScrollArea,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@wealthfolio/ui";
import { useTranslation } from "react-i18next";
import { downloadSampleCsv, downloadSampleHoldingsCsv } from "./utils/sample-csv";

// ─────────────────────────────────────────────────────────────────────────────
// Activities Help Content
// ─────────────────────────────────────────────────────────────────────────────

function ActivitiesHelpContent() {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div>
          <h4 className="text-lg font-semibold">{t("activity.import.help.act.title")}</h4>
          <p className="text-muted-foreground mt-2 text-sm">{t("activity.import.help.act.intro")}</p>
        </div>

        <div>
          <p className="font-semibold">{t("activity.import.help.act.steps_heading")}</p>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-sm">
            <li>{t("activity.import.help.act.step1")}</li>
            <li>{t("activity.import.help.act.step2")}</li>
            <li>{t("activity.import.help.act.step3")}</li>
            <li>{t("activity.import.help.act.step4")}</li>
            <li>{t("activity.import.help.act.step5")}</li>
          </ol>
        </div>

        <div>
          <p className="text-sm font-semibold">{t("activity.import.help.act.required_heading")}</p>
          <p className="text-muted-foreground mt-1 text-xs">{t("activity.import.help.act.required_list")}</p>
          <p className="mt-2 text-sm font-semibold">{t("activity.import.help.act.optional_heading")}</p>
          <p className="text-muted-foreground mt-1 text-xs">{t("activity.import.help.act.optional_list")}</p>
        </div>

        <div className="space-y-3">
          <div className="border-blue-500 bg-blue-50 p-3 dark:bg-blue-900/50">
            <p className="text-sm">
              <strong className="text-blue-700 dark:text-blue-300">
                {t("activity.import.help.act.tip_title")}
              </strong>{" "}
              {t("activity.import.help.act.tip_body")}
            </p>
          </div>

          <div className="border-green-500 bg-green-50 p-3 dark:bg-green-900/50">
            <p className="text-sm">
              <strong className="text-green-700 dark:text-green-300">
                {t("activity.import.help.act.amount_title")}
              </strong>{" "}
              {t("activity.import.help.act.amount_body")}
            </p>
          </div>

          <div className="border-purple-500 bg-purple-50 p-3 dark:bg-purple-900/50">
            <p className="text-sm">
              <strong className="text-purple-700 dark:text-purple-300">
                {t("activity.import.help.act.auto_title")}
              </strong>{" "}
              {t("activity.import.help.act.auto_body")}
            </p>
          </div>
        </div>

        <p className="text-xs">
          {t("activity.import.help.act.doc_suffix")}{" "}
          <a
            href="https://wealthfolio.app/docs/concepts/activity-types"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {t("activity.import.help.act.doc_link")}
          </a>
          .
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <p className="font-semibold">{t("activity.import.help.act.example_heading")}</p>
          <pre className="bg-muted mt-2 select-all overflow-x-auto p-3 text-xs leading-relaxed">
            <span className="text-muted-foreground">{t("activity.import.help.act.sample_standard_format")}</span>
            <br />
            date,symbol,instrumentType,quantity,activityType,unitPrice,currency,fee,amount,fxRate,subtype
            <br />
            2024-01-15,MSFT,EQUITY,10,BUY,380.50,USD,4.95,,,
            <br />
            2024-02-01,MSFT,EQUITY,1,DIVIDEND,0.75,USD,0,0.75,,QUALIFIED
            <br />
            2024-02-15,,,1,DEPOSIT,1,USD,0,1000.00,,
            <br />
            2024-06-01,TD.TO,EQUITY,10,BUY,85.00,CAD,9.99,,1.36,
            <br />
            <br />
            <span className="text-muted-foreground">
              {t("activity.import.help.act.sample_currency_symbols")}
            </span>
            <br />
            06/27/2025,AAPL,25,SELL,$48.95,USD,,$1223.63,,
            <br />
            06/20/2025,AAPL,8,BUY,$86.56,USD,,-$692.48,,
          </pre>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 flex items-center gap-1.5"
            onClick={downloadSampleCsv}
          >
            <Icons.Download className="h-4 w-4" />
            {t("activity.import.help.act.download_sample")}
          </Button>
        </div>

        <div>
          <p className="font-semibold">{t("activity.import.help.act.types_heading")}</p>
          <pre className="bg-muted mt-2 overflow-x-auto p-4 text-xs">
            <ul className="list-inside list-disc space-y-1">
              <li>BUY</li>
              <li>SELL</li>
              <li>DIVIDEND</li>
              <li>INTEREST</li>
              <li>DEPOSIT</li>
              <li>WITHDRAWAL</li>
              <li>{t("activity.import.help.act.type_transfer_in")}</li>
              <li>{t("activity.import.help.act.type_transfer_out")}</li>
              <li>FEE</li>
              <li>TAX</li>
              <li>{t("activity.import.help.act.type_split")}</li>
              <li>{t("activity.import.help.act.type_credit")}</li>
              <li>{t("activity.import.help.act.type_adjustment")}</li>
            </ul>
          </pre>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Holdings Help Content
// ─────────────────────────────────────────────────────────────────────────────

function HoldingsHelpContent() {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div>
          <h4 className="text-lg font-semibold">{t("activity.import.help.hold.title")}</h4>
          <p className="text-muted-foreground mt-2 text-sm">{t("activity.import.help.hold.intro")}</p>
        </div>

        <div>
          <p className="font-semibold">{t("activity.import.help.hold.steps_heading")}</p>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-sm">
            <li>{t("activity.import.help.hold.step1")}</li>
            <li>{t("activity.import.help.hold.step2")}</li>
            <li>{t("activity.import.help.hold.step3")}</li>
            <li>{t("activity.import.help.hold.step4")}</li>
          </ol>
        </div>

        <div>
          <p className="font-semibold">{t("activity.import.help.hold.required_heading")}</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
            <li>{t("activity.import.help.hold.req_date")}</li>
            <li>{t("activity.import.help.hold.req_symbol")}</li>
            <li>{t("activity.import.help.hold.req_qty")}</li>
          </ul>
          <p className="mt-3 font-semibold">{t("activity.import.help.hold.optional_heading")}</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
            <li>{t("activity.import.help.hold.opt_avgcost")}</li>
            <li>{t("activity.import.help.hold.opt_ccy")}</li>
          </ul>
        </div>

        <div className="space-y-3">
          <div className="border-blue-500 bg-blue-50 p-3 dark:bg-blue-900/50">
            <p className="text-sm">
              <strong className="text-blue-700 dark:text-blue-300">
                {t("activity.import.help.hold.tip_title")}
              </strong>{" "}
              {t("activity.import.help.hold.tip_body")}
            </p>
          </div>

          <div className="border-green-500 bg-green-50 p-3 dark:bg-green-900/50">
            <p className="text-sm">
              <strong className="text-green-700 dark:text-green-300">
                {t("activity.import.help.hold.cash_title")}
              </strong>{" "}
              {t("activity.import.help.hold.cash_body")}
            </p>
          </div>

          <div className="border-purple-500 bg-purple-50 p-3 dark:bg-purple-900/50">
            <p className="text-sm">
              <strong className="text-purple-700 dark:text-purple-300">
                {t("activity.import.help.hold.snap_title")}
              </strong>{" "}
              {t("activity.import.help.hold.snap_body")}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <p className="font-semibold">{t("activity.import.help.hold.example_heading")}</p>
          <pre className="bg-muted mt-2 select-all overflow-x-auto p-3 text-xs leading-relaxed">
            <span className="text-muted-foreground">{t("activity.import.help.hold.sample_snapshot")}</span>
            <br />
            date,symbol,quantity,avgCost,currency
            <br />
            2024-03-31,AAPL,50,171.48,USD
            <br />
            2024-03-31,MSFT,30,420.72,USD
            <br />
            2024-03-31,VOO,20,468.50,USD
            <br />
            2024-03-31,$CASH,5000,,USD
            <br />
            <br />
            <span className="text-muted-foreground">
              {t("activity.import.help.hold.sample_multiple_dates")}
            </span>
            <br />
            2024-06-30,AAPL,55,210.62,USD
            <br />
            2024-06-30,MSFT,30,446.34,USD
            <br />
            2024-06-30,VOO,25,495.89,USD
            <br />
            2024-06-30,$CASH,3200,,USD
          </pre>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 flex items-center gap-1.5"
            onClick={downloadSampleHoldingsCsv}
          >
            <Icons.Download className="h-4 w-4" />
            {t("activity.import.help.hold.download_sample")}
          </Button>
        </div>

        <div>
          <p className="font-semibold">{t("activity.import.help.hold.date_formats_heading")}</p>
          <pre className="bg-muted mt-2 overflow-x-auto p-4 text-xs">
            <ul className="list-inside list-disc space-y-1">
              <li>YYYY-MM-DD (2024-03-31)</li>
              <li>MM/DD/YYYY (03/31/2024)</li>
              <li>DD/MM/YYYY (31/03/2024)</li>
              <li>MM-DD-YYYY (03-31-2024)</li>
              <li>DD-MM-YYYY (31-03-2024)</li>
            </ul>
          </pre>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Import Help Popover
// ─────────────────────────────────────────────────────────────────────────────

interface ImportHelpPopoverProps {
  defaultTab?: "activities" | "holdings";
}

export function ImportHelpPopover({ defaultTab = "activities" }: ImportHelpPopoverProps) {
  const { isMobile } = usePlatform();
  const { t } = useTranslation();

  const helpContent = (
    <Tabs defaultValue={defaultTab}>
      <TabsList className="mb-4 w-auto">
        <TabsTrigger value="activities">{t("activity.import.help.tab_activities")}</TabsTrigger>
        <TabsTrigger value="holdings">{t("activity.import.help.tab_holdings")}</TabsTrigger>
      </TabsList>
      <TabsContent value="activities" className="m-0">
        <ActivitiesHelpContent />
      </TabsContent>
      <TabsContent value="holdings" className="m-0">
        <HoldingsHelpContent />
      </TabsContent>
    </Tabs>
  );

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9">
            <Icons.HelpCircle className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-4xl mx-1 h-[85vh]">
          <SheetHeader>
            <SheetTitle>{t("activity.import.help.sheet_title")}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(85vh-4rem)] pr-4">{helpContent}</ScrollArea>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="link" className="flex items-center">
          <Icons.HelpCircle className="mr-1 h-5 w-5" />
          {t("activity.import.help.trigger")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="m-4 max-h-[80vh] w-[900px] max-w-[calc(100vw-2rem)] overflow-y-auto p-6 text-sm">
        {helpContent}
      </PopoverContent>
    </Popover>
  );
}
