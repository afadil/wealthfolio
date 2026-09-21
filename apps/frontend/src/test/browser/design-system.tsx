import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import i18next from "@/i18n/i18n";
import { ShapePreservationExamples } from "./shape-preservation";
import { DesignSystemWidgets } from "./design-system-widgets";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FormattingProvider,
  GainAmount,
  GainPercent,
  Input,
  Label,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wealthfolio/ui";
import { CuratedThemeSelector } from "@/components/curated-theme-selector";
import { resolveThemeId, themes } from "@/themes/generated/registry";
import "@/globals.css";
import "./design-system.css";

const params = new URLSearchParams(location.search);
const initialMode = params.get("mode") === "dark" ? "dark" : "light";
function applyPreview(themeId: string, mode: "light" | "dark") {
  const root = document.documentElement;
  root.dataset.theme = themeId;
  root.classList.toggle("dark", mode === "dark");
  root.classList.toggle("light", mode === "light");
  root.style.colorScheme = mode;
}
applyPreview(resolveThemeId(params.get("theme")), initialMode);
document.documentElement.dir = params.get("rtl") === "1" ? "rtl" : "ltr";
const holdings = [
  { symbol: "ACME", name: "Acme Global Equity — synthetic", value: "$48,230.40", gain: 1230.4 },
  { symbol: "BOND", name: "Example Short Duration Bonds", value: "$26,450.00", gain: -342.2 },
  { symbol: "CASH", name: "Cash reserve", value: "$12,500.00", gain: 0 },
];

export function Fixture() {
  const [saved, setSaved] = useState(false);
  const [themeId, setThemeId] = useState(resolveThemeId(params.get("theme")));
  const [mode, setMode] = useState<"light" | "dark">(initialMode);
  useEffect(() => {
    applyPreview(themeId, mode);
    const url = new URL(location.href);
    url.searchParams.set("theme", themeId);
    url.searchParams.set("mode", mode);
    for (const key of ["style", "treatment", "contrast"]) url.searchParams.delete(key);
    history.replaceState(history.state, "", url);
  }, [themeId, mode]);
  return (
    <FormattingProvider locale={params.get("locale") ?? "en-US"}>
      <main className="mx-auto max-w-6xl space-y-8 p-4 sm:p-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-muted-foreground text-xs">WEALTHFOLIO · SYNTHETIC FIXTURE</p>
            <h1 className="text-2xl font-semibold">Design system baseline</h1>
          </div>
          <div className="preview-toolbar flex flex-wrap items-center gap-4">
            <Label
              htmlFor="preview-dark"
              className="flex min-h-11 cursor-pointer items-center gap-2"
            >
              <span>Light</span>
              <Switch
                id="preview-dark"
                aria-label="Dark mode"
                checked={mode === "dark"}
                onCheckedChange={(checked) => setMode(checked ? "dark" : "light")}
              />
              <span>Dark</span>
            </Label>
            <Badge variant="secondary">
              {themes.find((theme) => theme.id === themeId)?.name} / {mode}
            </Badge>
          </div>
        </header>
        {params.has("gallery") && <CuratedThemeSelector value={themeId} onChange={setThemeId} />}
        {params.has("controls") && (
          <section aria-label="Destructive contrast fixtures">
            {["background", "card"].map((surface) => (
              <div
                key={surface}
                data-surface={surface}
                style={{ background: `var(--${surface})` }}
                className="flex gap-4 p-4"
              >
                <Button variant="destructive" data-testid={`${surface}-button`}>
                  Destructive button
                </Button>
                <Badge variant="destructive" data-testid={`${surface}-badge`}>
                  Destructive badge
                </Badge>
                <Badge variant="destructive" asChild>
                  <a href="#controls" data-testid={`${surface}-link`}>
                    Destructive link
                  </a>
                </Badge>
                <button
                  type="button"
                  data-testid={`${surface}-legacy`}
                  className="bg-destructive hover:bg-destructive/90 dark:bg-destructive/60 text-white"
                >
                  Legacy reference
                </button>
              </div>
            ))}
          </section>
        )}
        <section aria-labelledby="controls-title" className="space-y-4">
          <h2 id="controls-title" className="text-lg font-semibold">
            Components and states
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary action</Button>
            <Button variant="outline">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Delete</Button>
            <Button disabled>Unavailable</Button>
            <Badge variant="info" data-testid="info-badge">
              Information
            </Badge>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Open dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Review activity</DialogTitle>
                  <DialogDescription>
                    Synthetic fixture. No financial data is saved.
                  </DialogDescription>
                </DialogHeader>
                <Label htmlFor="dialog-note">Note</Label>
                <Input id="dialog-note" defaultValue="Example activity" />
              </DialogContent>
            </Dialog>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="normal">Account name</Label>
              <Input id="normal" placeholder="Example account" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invalid">Invalid field</Label>
              <Input id="invalid" aria-invalid="true" defaultValue="Invalid value" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="disabled">Disabled field</Label>
              <Input id="disabled" disabled value="Unavailable" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <Label className="flex items-center gap-2">
              <Checkbox defaultChecked />
              Include closed accounts
            </Label>
            <Label className="flex items-center gap-2">
              <Switch defaultChecked />
              Show balances
            </Label>
            <Skeleton className="h-6 w-24" />
          </div>
        </section>
        {params.has("contracts") && <ShapePreservationExamples />}
        <DesignSystemWidgets />
        <section aria-labelledby="holdings-title" className="space-y-4">
          <h2 id="holdings-title" className="text-lg font-semibold">
            Holdings
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Return</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdings.map((holding) => (
                <TableRow key={holding.symbol}>
                  <TableCell>
                    <p className="font-medium">{holding.symbol}</p>
                    <p className="text-muted-foreground text-xs">{holding.name}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{holding.value}</TableCell>
                  <TableCell>
                    <GainAmount value={holding.gain} currency="USD" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex gap-6">
            <GainPercent value={0.042} />
            <GainPercent value={-0.013} />
            <GainPercent value={0} />
          </div>
        </section>
        <section aria-labelledby="activity-title" className="space-y-4">
          <h2 id="activity-title" className="text-lg font-semibold">
            Add activity
          </h2>
          <form
            className="grid max-w-2xl gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSaved(true);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="asset">Asset</Label>
              <Input id="asset" defaultValue="ACME" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" inputMode="decimal" defaultValue="12.345678" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price (USD)</Label>
              <Input id="price" inputMode="decimal" defaultValue="123.45" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fees">Fees (USD)</Label>
              <Input id="fees" inputMode="decimal" defaultValue="0.00" />
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit">Save example</Button>
              <span role="status">{saved ? "Example submitted" : ""}</span>
            </div>
          </form>
        </section>
      </main>
    </FormattingProvider>
  );
}

void i18next.changeLanguage("en").then(() => {
  createRoot(document.getElementById("root")!).render(<Fixture />);
});
