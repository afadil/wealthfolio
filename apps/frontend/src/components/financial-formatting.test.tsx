import { render, screen } from "@testing-library/react";
import { FormattingProvider, GainAmount, GainPercent } from "@wealthfolio/ui";
import { describe, expect, it, vi } from "vitest";

vi.mock("@number-flow/react", async () => {
  const { forwardRef } = await import("react");
  return {
    default: forwardRef<
      HTMLSpanElement,
      { value: number; locales?: string; format?: Intl.NumberFormatOptions }
    >(({ value, locales, format }, ref) => (
      <span ref={ref} data-testid="animated-financial-value">
        {new Intl.NumberFormat(locales, format).format(value)}
      </span>
    )),
  };
});

describe("localized financial components", () => {
  it("preserves Wealthfolio quote-unit symbols in gain amounts", () => {
    render(
      <FormattingProvider locale="US" uiLocale="en">
        <GainAmount value={12.34} currency="GBp" />
      </FormattingProvider>,
    );
    expect(screen.getByText("+12.34p")).toBeInTheDocument();
  });

  it("formats gain amounts in the currency's own region", () => {
    render(
      <FormattingProvider locale="US" uiLocale="en" currencyFormattingRegions={{ INR: "IN" }}>
        <GainAmount value={1234567.89} currency="INR" />
        <GainAmount value={1234567.89} currency="USD" />
      </FormattingProvider>,
    );
    expect(screen.getByText("+₹12,34,567.89")).toBeInTheDocument();
    expect(screen.getByText("+$1,234,567.89")).toBeInTheDocument();
  });

  it("shows gain amounts with each currency's minor units", () => {
    render(
      <FormattingProvider locale="US" uiLocale="en">
        <GainAmount value={1234} currency="JPY" />
        <GainAmount value={1.2345} currency="KWD" />
        <GainAmount value={0.004} currency="KWD" />
        <GainAmount value={0} currency="JPY" displayCurrency={false} />
      </FormattingProvider>,
    );
    expect(screen.getByText("+¥1,234")).toBeInTheDocument();
    expect(screen.getByText("+KWD 1.235")).toBeInTheDocument();
    expect(screen.getByText("+KWD 0.004")).toBeInTheDocument();
    expect(screen.getByText("0").parentElement).toHaveClass("text-foreground");
  });

  it.each([
    { currency: "JPY", value: 0.4, expected: "+¥0.4" },
    { currency: "JPY", value: -0.04, expected: "-¥0.04" },
    { currency: "JPY", value: 0.00001234, expected: "+¥0.000012" },
    { currency: "USD", value: 0.004, expected: "+$0.004" },
    { currency: "USD", value: -0.004, expected: "-$0.004" },
    { currency: "KWD", value: 0.0004, expected: "+KWD 0.0004" },
    { currency: "KWD", value: -0.0004, expected: "-KWD 0.0004" },
    { currency: "GBp", value: 0.004, expected: "+0.004p" },
    { currency: "GBp", value: -0.004, expected: "-0.004p" },
    { currency: "JPY", value: 0.5, expected: "+¥1" },
    { currency: "JPY", value: -0.5, expected: "-¥1" },
    { currency: "USD", value: 0.005, expected: "+$0.01" },
    { currency: "USD", value: -0.005, expected: "-$0.01" },
  ])(
    "preserves the sign and color of $value $currency gains",
    async ({ currency, value, expected }) => {
      const { container } = render(
        <FormattingProvider locale="US">
          <GainAmount value={value} currency={currency} />
        </FormattingProvider>,
      );
      const gain = container.firstElementChild?.firstElementChild;
      expect(gain?.textContent?.replace(/[\u00a0\u202f]/g, " ")).toBe(expected);
      expect(gain).toHaveClass(value > 0 ? "text-success" : "text-destructive");

      await screen.findByTestId("animated-financial-value");
      expect(gain?.textContent?.replace(/[\u00a0\u202f]/g, " ")).toBe(expected);
      expect(gain).toHaveClass(value > 0 ? "text-success" : "text-destructive");
    },
  );

  it.each([0, -0, 0.4, -0.4])(
    "keeps whole-number gains neutral when decimals are disabled (%s)",
    async (value) => {
      const { container } = render(
        <FormattingProvider locale="US">
          <GainAmount value={value} currency="JPY" displayDecimal={false} />
        </FormattingProvider>,
      );
      const gain = container.firstElementChild?.firstElementChild;
      expect(gain).toHaveTextContent(/^¥0$/);
      expect(gain).toHaveClass("text-foreground");

      await screen.findByTestId("animated-financial-value");
      expect(gain).toHaveTextContent(/^¥0$/);
      expect(gain).toHaveClass("text-foreground");
    },
  );

  it("preserves small-value formatting with region, sign, symbol and color options", async () => {
    const { container } = render(
      <FormattingProvider locale="US" currencyFormattingRegions={{ USD: "FR" }}>
        <GainAmount
          value={-0.004}
          currency="USD"
          displayCurrency={false}
          showSign={false}
          invertColor
        />
      </FormattingProvider>,
    );
    const gain = container.firstElementChild?.firstElementChild;
    expect(gain).toHaveTextContent(/^0,004$/);
    expect(gain).toHaveClass("text-success");

    await screen.findByTestId("animated-financial-value");
    expect(gain).toHaveTextContent(/^0,004$/);
    expect(gain).toHaveClass("text-success");
  });

  it("preserves locale percent spacing in the animated fallback", () => {
    const { container } = render(
      <FormattingProvider locale="FR" uiLocale="fr">
        <GainPercent value={0.125} animated />
      </FormattingProvider>,
    );
    expect(container.textContent).toMatch(/^\+12,50[\u00a0\u202f ]%$/);
  });
});
