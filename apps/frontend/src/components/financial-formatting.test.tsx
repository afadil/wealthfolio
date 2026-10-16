import { render, screen } from "@testing-library/react";
import { FormattingProvider, GainAmount, GainPercent } from "@wealthfolio/ui";
import { describe, expect, it } from "vitest";

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

  it("preserves locale percent spacing in the animated fallback", () => {
    const { container } = render(
      <FormattingProvider locale="FR" uiLocale="fr">
        <GainPercent value={0.125} animated />
      </FormattingProvider>,
    );
    expect(container.textContent).toMatch(/^\+12,50[\u00a0\u202f ]%$/);
  });
});
