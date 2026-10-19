import { render, screen } from "@testing-library/react";
import {
  DirectionProvider,
  FormattingProvider,
  GainPercent,
  useAmountFormatting,
  useDateFormatting,
  useNumberFormatting,
  type TextDirection,
} from "@wealthfolio/ui";
import { describe, expect, it } from "vitest";

const FSI = "⁨";
const PDI = "⁩";

function Probe() {
  const { formatAmount } = useAmountFormatting();
  const { formatPercent, parseNumber } = useNumberFormatting();
  const { formatTime } = useDateFormatting();
  const amount = formatAmount(-1234.56, "USD");
  return (
    <>
      <output aria-label="amount">{amount}</output>
      <output aria-label="percent">{formatPercent(0.686, { signDisplay: "exceptZero" })}</output>
      <output aria-label="time">{formatTime(new Date("2026-10-18T09:30:00Z"))}</output>
      <output aria-label="parsed">{String(parseNumber(amount))}</output>
    </>
  );
}

function renderIn(direction: TextDirection, children = <Probe />) {
  return render(
    <DirectionProvider direction={direction}>
      <FormattingProvider locale="en-US" timezone="UTC">
        {children}
      </FormattingProvider>
    </DirectionProvider>,
  );
}

const text = (name: string) => screen.getByRole("status", { name }).textContent;

describe("formatted values in a right-to-left page", () => {
  it("are isolated so a sign or AM/PM stays on its side", () => {
    renderIn("rtl");

    expect(text("amount")).toBe(`${FSI}-$1,234.56${PDI}`);
    expect(text("percent")).toBe(`${FSI}+68.60%${PDI}`);
    expect(text("time")).toBe(`${FSI}9:30 AM${PDI}`);
    // Isolates never reach a parsed value.
    expect(text("parsed")).toBe("-1234.56");
  });

  it("stay byte for byte as before in a left-to-right page", () => {
    renderIn("ltr");

    expect(text("amount")).toBe("-$1,234.56");
    expect(text("percent")).toBe("+68.60%");
    expect(text("time")).toBe("9:30 AM");
  });

  it("reach shared financial components", () => {
    renderIn("rtl", <GainPercent value={0.686} />);

    expect(screen.getByText(`${FSI}+68.60%${PDI}`)).toBeInTheDocument();
  });
});
