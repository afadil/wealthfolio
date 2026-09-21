/** Compiled from a temporary consumer against package exports, without source aliases. */
import { createRef } from "react";
import {
  AmountDisplay,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  FormattingProvider,
  GainAmount,
  GainPercent,
  Sheet,
  SheetContent,
  SheetTitle,
  useAmountFormatting,
} from "@wealthfolio/ui";
import { Bar, BarChart, ChartContainer, type ChartConfig } from "@wealthfolio/ui/chart";
import type { Settings } from "@wealthfolio/addon-sdk";

const chartConfig = {
  assets: { label: "Assets", color: "var(--chart-1)" },
  benchmark: {
    label: "Benchmark",
    theme: { light: "var(--chart-benchmark)", dark: "var(--chart-benchmark)" },
  },
} satisfies ChartConfig;

export function PublicApiFixture({ settings }: { settings: Settings }) {
  const buttonRef = createRef<HTMLButtonElement>();
  const dialogRef = createRef<HTMLDivElement>();
  const sheetRef = createRef<HTMLDivElement>();
  const palette: string = settings.themeId ?? "flexoki";
  return (
    <FormattingProvider locale="CA" uiLocale="en" timezone="America/Toronto">
      <section data-theme={palette}>
        <Button asChild ref={buttonRef} variant="secondary" size="icon-sm">
          <a href="#account">Account</a>
        </Button>
        <Badge variant="success">Gain</Badge>
        <Badge variant="warning">Pending</Badge>
        <Badge variant="info">Info</Badge>
        <Dialog useIsMobile={() => false}>
          <DialogContent
            ref={dialogRef}
            side="bottom"
            mobileClassName="pb-8"
            showCloseButton
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <DialogTitle>Account</DialogTitle>
          </DialogContent>
        </Dialog>
        <Sheet>
          <SheetContent
            ref={sheetRef}
            side="right"
            showCloseButton
            onEscapeKeyDown={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <SheetTitle>Activity</SheetTitle>
          </SheetContent>
        </Sheet>
        <AmountDisplay value={1234.567} currency="CAD" isHidden colorFormat invertColor />
        <GainAmount value={-12.345} currency="CAD" showSign invertColor />
        <GainPercent value={0.012345} variant="badge" animated={false} showSign invertColor />
        <FormattedValue />
        <ChartContainer config={chartConfig}>
          <BarChart data={[{ assets: 1234 }]}>
            <Bar dataKey="assets" fill="var(--color-assets)" />
          </BarChart>
        </ChartContainer>
      </section>
    </FormattingProvider>
  );
}

function FormattedValue() {
  const formatting = useAmountFormatting();
  return <span>{formatting.formatAmount(1234.567, "CAD")}</span>;
}
