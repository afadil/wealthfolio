import { useId, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Combobox } from "@base-ui/react/combobox";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { createColumnHelper } from "@tanstack/react-table";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import {
  Button,
  DataGrid,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  FormattingProvider,
  Input,
  SearchableSelect,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
  TooltipProvider,
  useDataGrid,
  isKeyboardEventComposing,
} from "@wealthfolio/ui";
import "@/globals.css";

interface Account {
  value: string;
  label: string;
}
const accounts: Account[] = [
  { value: "cash", label: "Cash reserve" },
  { value: "rrsp", label: "Retirement" },
  { value: "taxable", label: "Investment" },
  { value: "joint", label: "Investment" },
];
function AccountPicker({
  label,
  value,
  onValueChange,
  localPortal = false,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  localPortal?: boolean;
}) {
  const id = useId();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setContainer}>
      <Combobox.Root
        modal={false}
        items={accounts}
        value={accounts.find((a) => a.value === value) ?? null}
        onValueChange={(account) => onValueChange(account?.value ?? "")}
        itemToStringLabel={(account) => account.label}
      >
        <label htmlFor={id}>{label}</label>
        <Combobox.InputGroup className="flex items-center gap-2">
          <Combobox.Input
            id={id}
            className="border-input bg-input-bg h-11 w-48 rounded-md border px-3"
            onKeyDown={(event) => {
              if (
                (event.key === "Enter" || event.key === "Escape") &&
                isKeyboardEventComposing(event.nativeEvent)
              ) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
          />
          <Combobox.Clear
            aria-label={`Clear ${label}`}
            className="border-input h-11 rounded-md border px-3"
          >
            Clear
          </Combobox.Clear>
          <Combobox.Trigger
            aria-label={`Open ${label}`}
            className="border-input h-11 rounded-md border px-3"
          >
            Open
          </Combobox.Trigger>
        </Combobox.InputGroup>
        <Combobox.Portal container={localPortal ? container : undefined}>
          <Combobox.Positioner className="z-100" sideOffset={4}>
            <Combobox.Popup
              data-grid-popover=""
              className="bg-popover text-popover-foreground min-w-48 rounded-md border p-2 shadow-lg"
            >
              <Combobox.Empty>No accounts found</Combobox.Empty>
              <Combobox.List>
                {(account: Account) => (
                  <Combobox.Item
                    key={account.value}
                    value={account}
                    className="data-highlighted:bg-accent cursor-pointer rounded px-3 py-2"
                  >
                    {account.label}
                    <span className="text-muted-foreground ml-2 text-xs">{account.value}</span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  );
}
interface Row {
  id: string;
  note: string;
  account: string;
}
function GridFixture() {
  const [rows, setRows] = useState<Row[]>([
    { id: "synthetic", note: "Editable note", account: "cash" },
  ]);
  const columns = useMemo(() => {
    const helper = createColumnHelper<Row>();
    return [
      helper.accessor("note", {
        header: "Note",
        size: 220,
        meta: { cell: { variant: "long-text" } },
      }),
      helper.display({
        id: "actions",
        header: () => "Account",
        size: 380,
        cell: ({ row }) => (
          <AccountPicker
            label="Grid account"
            value={row.original.account}
            onValueChange={(account) =>
              setRows((current) =>
                current.map((item) => (item.id === row.original.id ? { ...item, account } : item)),
              )
            }
          />
        ),
      }),
    ];
  }, []);
  const grid = useDataGrid({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    onDataChange: setRows,
  });
  return (
    <>
      <DataGrid {...grid} height={220} />
      <output aria-label="Grid result">{JSON.stringify(rows)}</output>
    </>
  );
}
function Pilot() {
  const [value, setValue] = useState("");
  const [submits, setSubmits] = useState(0);
  const composing = useRef(false);
  return (
    <TooltipProvider>
      <FormattingProvider locale="en-US">
        <main className="mx-auto max-w-5xl space-y-6 p-6">
          <h1 className="text-2xl font-semibold">Base UI compatibility pilot</h1>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSubmits((n) => n + 1);
            }}
            className="space-y-3"
          >
            <AccountPicker label="Account" value={value} onValueChange={setValue} />
            <output aria-label="Selected account">{value || "none"}</output>
            <Button type="submit">Submit account</Button>
            <output aria-label="Submit count">{submits}</output>
          </form>
          <section aria-label="Radix reference">
            <h2>Current selector</h2>
            <SearchableSelect options={accounts} value={value} onValueChange={setValue} />
            <Dialog>
              <DialogTrigger asChild>
                <Button>Open current dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Current dialog</DialogTitle>
                <Input aria-label="Current note" />
              </DialogContent>
            </Dialog>
          </section>
          <BaseDialog.Root
            onOpenChange={(_, details) => {
              if (composing.current && details.reason === "escape-key") details.cancel();
            }}
          >
            <BaseDialog.Trigger render={<Button />}>Open Base dialog</BaseDialog.Trigger>
            <BaseDialog.Portal>
              <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
              <BaseDialog.Popup
                className="bg-card text-card-foreground fixed left-1/2 top-1/2 z-50 w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-lg border p-6"
                onCompositionStart={() => (composing.current = true)}
                onCompositionEnd={() => (composing.current = false)}
                onKeyDown={(event) => {
                  if (
                    (event.key === "Enter" || event.key === "Escape") &&
                    isKeyboardEventComposing(event.nativeEvent)
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
              >
                <BaseDialog.Title>Base dialog</BaseDialog.Title>
                <BaseDialog.Description>Synthetic account selection</BaseDialog.Description>
                <Input aria-label="Base note" />
                <AccountPicker label="Dialog account" value={value} onValueChange={setValue} />
                <BaseDialog.Close render={<Button type="button" />}>
                  Close Base dialog
                </BaseDialog.Close>
              </BaseDialog.Popup>
            </BaseDialog.Portal>
          </BaseDialog.Root>
          <Sheet>
            <SheetTrigger asChild>
              <Button>Open Radix sheet</Button>
            </SheetTrigger>
            <SheetContent side="bottom">
              <SheetTitle>Mixed library sheet</SheetTitle>
              <AccountPicker
                localPortal
                label="Sheet account"
                value={value}
                onValueChange={setValue}
              />
            </SheetContent>
          </Sheet>
          <section aria-label="Actual grid editor">
            <h2>Existing data grid with pilot selector</h2>
            <GridFixture />
          </section>
          <Button type="button">Outside target</Button>
        </main>
      </FormattingProvider>
    </TooltipProvider>
  );
}
void i18next
  .use(initReactI18next)
  .init({ lng: "en", fallbackLng: "en", resources: {}, interpolation: { escapeValue: false } })
  .then(() => createRoot(document.getElementById("root")!).render(<Pilot />));
