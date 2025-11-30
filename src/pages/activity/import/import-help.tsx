import { Icons } from "@/components/ui/icons";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePlatform } from "@/hooks/use-platform";
import {
  ScrollArea,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@wealthvn/ui";

export function ImportHelpPopover() {
  const { isMobile } = usePlatform();
  const { t } = useTranslation("activity");

  const helpContent = (
    <div className="space-y-4">
      <div>
        <h4 className="text-lg font-semibold">{t("import.help.heading")}</h4>
        <p className="text-muted-foreground mt-2 text-sm">{t("import.help.description")}</p>
      </div>

      <div>
        <p className="font-semibold">{t("import.help.stepsTitle")}</p>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm">
          <li>{t("import.help.step1")}</li>
          <li>{t("import.help.step2")}</li>
          <li>
            {t("import.help.step3")}
            <span className="text-muted-foreground ml-2 text-xs">
              {t("import.help.step3Fields")}
            </span>
          </li>
          <li>{t("import.help.step4")}</li>
          <li>{t("import.help.step5")}</li>
        </ol>
      </div>

      <div className="space-y-3">
        <div className="border-blue-500 bg-blue-50 p-3 dark:bg-blue-900/50">
          <p className="text-sm">
            <strong className="text-blue-700 dark:text-blue-300">
              {t("import.help.tipTitle")}
            </strong>{" "}
            {t("import.help.tipText")}
          </p>
        </div>

        <div className="border-green-500 bg-green-50 p-3 dark:bg-green-900/50">
          <p className="text-sm">
            <strong className="text-green-700 dark:text-green-300">
              {t("import.help.amountFieldTitle")}
            </strong>{" "}
            {t("import.help.amountFieldText")}
          </p>
        </div>

        <div className="border-purple-500 bg-purple-50 p-3 dark:bg-purple-900/50">
          <p className="text-sm">
            <strong className="text-purple-700 dark:text-purple-300">
              {t("import.help.autoFormattingTitle")}
            </strong>{" "}
            {t("import.help.autoFormattingText")}
          </p>
        </div>
      </div>

      <div>
        <p className="font-semibold">{t("import.help.supportedTypesTitle")}</p>
        <pre className="bg-muted mt-2 overflow-x-auto p-4 text-xs">
          <ul className="list-inside list-disc space-y-1">
            <li>{t("import.help.typeBuy")}</li>
            <li>{t("import.help.typeSell")}</li>
            <li>{t("import.help.typeDividend")}</li>
            <li>{t("import.help.typeInterest")}</li>
            <li>{t("import.help.typeDeposit")}</li>
            <li>{t("import.help.typeWithdrawal")}</li>
            <li>{t("import.help.typeAddHolding")}</li>
            <li>{t("import.help.typeRemoveHolding")}</li>
            <li>{t("import.help.typeTransferIn")}</li>
            <li>{t("import.help.typeTransferOut")}</li>
            <li>{t("import.help.typeFee")}</li>
            <li>{t("import.help.typeTax")}</li>
            <li>{t("import.help.typeSplit")}</li>
          </ul>
        </pre>
      </div>

      <div>
        <p className="font-semibold">{t("import.help.exampleTitle")}</p>
        <pre className="bg-muted mt-2 overflow-x-auto p-3 text-xs leading-relaxed select-all">
          <span className="text-muted-foreground">{t("import.help.exampleStandard")}</span>
          <br />
          date,symbol,quantity,activityType,unitPrice,currency,fee,amount
          <br />
          2024-01-01,MSFT,1,DIVIDEND,57.5,USD,0,57.5
          <br />
          2023-12-15,MSFT,30,BUY,368.60,USD,0
          <br />
          2023-08-11,$CASH-USD,1,DEPOSIT,1,USD,0,600.03
          <br />
          <br />
          <span className="text-muted-foreground">{t("import.help.exampleWithSymbols")}</span>
          <br />
          06/27/2025,AAPL,25,SELL,$48.95,USD,,$1223.63
          <br />
          06/20/2025,AAPL,8,BUY,$86.56,USD,,-$692.48
        </pre>
      </div>

      <p className="text-xs">
        {t("import.help.documentationText")}{" "}
        <a
          href="https://github.com/chipheo00/vn-wealthfolio/blob/main/docs/activities/activity-types.md"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {t("import.help.documentationLink")}
        </a>
        .
      </p>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9">
            <Icons.HelpCircle className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="mx-1 h-[85vh] rounded-t-4xl">
          <SheetHeader>
            <SheetTitle>{t("import.help.sheetTitle")}</SheetTitle>
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
          {t("import.help.title")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="m-4 w-[900px] max-w-[calc(100vw-2rem)] p-6 text-sm">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">{helpContent}</div>
      </PopoverContent>
    </Popover>
  );
}
