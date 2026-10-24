import { render, screen } from "@testing-library/react";
import { FormattingProvider } from "@wealthfolio/ui";
import { describe, expect, it, vi } from "vitest";
import Balance from "./balance";

vi.mock("@/hooks/use-balance-privacy", () => ({
  useBalancePrivacy: () => ({ isBalanceHidden: false }),
}));

vi.mock("@number-flow/react", () => ({
  default: ({
    value,
    locales,
    format,
  }: {
    value: number;
    locales?: string;
    format?: Intl.NumberFormatOptions;
  }) => (
    <span
      data-testid="visible-balance-locale"
      data-fraction-digits={format?.maximumFractionDigits}
      data-formatted-value={new Intl.NumberFormat(locales, format).format(value)}
    >
      {locales}
    </span>
  ),
}));

describe("Balance", () => {
  it("passes the selected formatting locale to the visible number", () => {
    render(
      <FormattingProvider locale="DE">
        <Balance targetValue={1234.56} currency="EUR" displayCurrency />
      </FormattingProvider>,
    );

    expect(screen.getByTestId("visible-balance-locale")).toHaveTextContent("de-DE");
  });

  it("formats each currency in its own region", () => {
    const { unmount } = render(
      <FormattingProvider locale="US" currencyFormattingRegions={{ INR: "IN" }}>
        <Balance targetValue={1234567.89} currency="INR" displayCurrency />
      </FormattingProvider>,
    );

    expect(screen.getByTestId("visible-balance-locale")).toHaveTextContent("en-IN");
    expect(screen.getByTestId("portfolio-balance-value")).toHaveTextContent("₹12,34,567.89");
    unmount();

    render(
      <FormattingProvider locale="US" currencyFormattingRegions={{ INR: "IN" }}>
        <Balance targetValue={1234567.89} currency="USD" displayCurrency />
      </FormattingProvider>,
    );

    expect(screen.getByTestId("visible-balance-locale")).toHaveTextContent("en-US");
    expect(screen.getByTestId("portfolio-balance-value")).toHaveTextContent("$1,234,567.89");
  });

  it("shows each currency's minor units", () => {
    const { unmount } = render(
      <FormattingProvider locale="US">
        <Balance targetValue={1234.56} currency="JPY" displayCurrency />
      </FormattingProvider>,
    );

    expect(screen.getByTestId("visible-balance-locale")).toHaveAttribute(
      "data-fraction-digits",
      "0",
    );
    expect(screen.getByTestId("portfolio-balance-value")).toHaveTextContent("¥1,235");
    unmount();

    render(
      <FormattingProvider locale="US">
        <Balance targetValue={1.2345} currency="KWD" displayCurrency />
      </FormattingProvider>,
    );

    expect(screen.getByTestId("visible-balance-locale")).toHaveAttribute(
      "data-fraction-digits",
      "3",
    );
    expect(screen.getByTestId("portfolio-balance-value")).toHaveTextContent("KWD 1.235");
  });

  it.each([
    { currency: "JPY", value: -0.4, expected: "¥0" },
    { currency: "JPY", value: 0.4, expected: "¥0" },
    { currency: "USD", value: -0.004, expected: "$0.00" },
    { currency: "JPY", value: -0.5, expected: "-¥1" },
  ])(
    "rounds $value $currency consistently without negative zero",
    ({ currency, value, expected }) => {
      render(
        <FormattingProvider locale="US">
          <Balance targetValue={value} currency={currency} displayCurrency />
        </FormattingProvider>,
      );
      expect(screen.getByTestId("visible-balance-locale")).toHaveAttribute(
        "data-formatted-value",
        expected,
      );
      expect(screen.getByTestId("portfolio-balance-value")).toHaveTextContent(expected);
    },
  );
});
