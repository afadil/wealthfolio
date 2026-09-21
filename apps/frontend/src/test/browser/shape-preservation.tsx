import { CurrencyInput } from "@wealthfolio/ui/components/financial/currency-input";
import { ResponsiveSelect } from "@wealthfolio/ui/components/ui/responsive-select";
import { SearchableSelect } from "@wealthfolio/ui/components/common/searchable-select";
import {
  Button,
  AnimatedToggleGroup,
  Card,
  CardContent,
  Input,
  DatePickerInput,
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Textarea,
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@wealthfolio/ui";

export function ShapePreservationExamples() {
  return (
    <section aria-label="Shape preservation" className="space-y-4">
      <Card>
        <CardContent data-testid="flush-card" className="p-0">
          Flush content
        </CardContent>
      </Card>
      <Input
        aria-label="Compact field"
        className="pointer-coarse:min-h-0 h-8 min-h-0 rounded-none max-sm:min-h-0"
      />
      <InputGroup data-testid="compact-group">
        <InputGroupInput aria-label="Grouped field" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Group action">
            +
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <Button size="icon-xs" aria-label="Standalone icon">
        +
      </Button>
      <Select defaultValue="all">
        <SelectTrigger aria-label="Account scope">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All accounts</SelectItem>
          <SelectItem value="retirement">Retirement</SelectItem>
        </SelectContent>
      </Select>
      <DatePickerInput
        data-testid="themed-date"
        value="2026-09-07"
        onChange={() => {}}
        enableTime
      />
      <AnimatedToggleGroup
        aria-label="Themed periods"
        items={[
          { value: "1M", label: "1M" },
          { value: "3M", label: "3M" },
        ]}
        defaultValue="1M"
      />
      <Input aria-label="Standard field" />
      <CurrencyInput aria-label="Field currency" value="USD" onChange={() => {}} />
      <div data-testid="field-responsive">
        <ResponsiveSelect options={[{ value: "all", label: "All" }]} onValueChange={() => {}} />
      </div>
      <div data-testid="field-searchable">
        <SearchableSelect options={[]} onValueChange={() => {}} />
      </div>
      <Textarea aria-label="Notes" placeholder="Notes" />
      {(["left", "right", "top", "bottom"] as const).map((side) => (
        <Sheet key={side}>
          <SheetTrigger asChild>
            <Button>Open {side} sheet</Button>
          </SheetTrigger>
          <SheetContent side={side}>
            <SheetTitle>{side} panel</SheetTitle>
            <SheetDescription>Placement and focus preservation.</SheetDescription>
            <Input aria-label={`${side} panel field`} />
          </SheetContent>
        </Sheet>
      ))}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button>Open confirmation</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Confirm example</AlertDialogTitle>
          <AlertDialogDescription>Synthetic confirmation.</AlertDialogDescription>
          <AlertDialogCancel>Cancel example</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
