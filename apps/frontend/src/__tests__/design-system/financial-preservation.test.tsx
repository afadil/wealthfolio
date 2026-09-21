import { act, render, screen } from "@testing-library/react";
import { AmountDisplay, FormattingProvider, GainAmount, GainPercent } from "@wealthfolio/ui";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => localStorage.removeItem("privacy-settings"));

describe("financial visual semantics", () => {
  it.each([
    { value: 12.34, invertColor: false, color: "text-gain", text: "+$12.34" },
    { value: -12.34, invertColor: false, color: "text-loss", text: "-$12.34" },
    { value: 12.34, invertColor: true, color: "text-loss", text: "+$12.34" },
    { value: -12.34, invertColor: true, color: "text-gain", text: "-$12.34" },
    { value: -0.004, invertColor: false, color: "text-flat", text: "$0.00" },
  ])("keeps amount sign independent of inverted color: $value / $invertColor", (test) => {
    render(
      <FormattingProvider locale="en-US">
        <GainAmount value={test.value} invertColor={test.invertColor} currency="USD" />
      </FormattingProvider>,
    );
    const amount = screen.getByText(test.text);
    expect(amount.parentElement).toHaveClass(test.color);
  });

  it("normalizes rounded negative zero in percentage badges, including inverted semantics", () => {
    render(
      <FormattingProvider locale="en-US">
        <GainPercent value={-0.00004} invertColor variant="badge" data-testid="percent" />
      </FormattingProvider>,
    );
    expect(screen.getByTestId("percent")).toHaveTextContent(/^0.00%$/);
    expect(screen.getByTestId("percent")).toHaveClass("text-flat", "bg-flat/10");
  });

  it.each([
    {
      value: 0.125,
      invertColor: false,
      color: "text-gain",
      background: "bg-gain/10",
      text: "+12.50%",
    },
    {
      value: -0.125,
      invertColor: false,
      color: "text-loss",
      background: "bg-loss/10",
      text: "-12.50%",
    },
    {
      value: 0.125,
      invertColor: true,
      color: "text-loss",
      background: "bg-loss/10",
      text: "+12.50%",
    },
    {
      value: -0.125,
      invertColor: true,
      color: "text-gain",
      background: "bg-gain/10",
      text: "-12.50%",
    },
  ])(
    "keeps percentage badge sign and alpha independent of inversion: $value/$invertColor",
    (test) => {
      render(
        <FormattingProvider locale="en-US">
          <GainPercent
            value={test.value}
            invertColor={test.invertColor}
            variant="badge"
            data-testid="percent"
          />
        </FormattingProvider>,
      );
      expect(screen.getByTestId("percent")).toHaveTextContent(test.text);
      expect(screen.getByTestId("percent")).toHaveClass(test.color, test.background);
    },
  );

  it.each([
    { value: 0, invertColor: false, color: "text-gain" },
    { value: 0, invertColor: true, color: "text-loss" },
    { value: -12, invertColor: false, color: "text-loss" },
    { value: -12, invertColor: true, color: "text-gain" },
  ])(
    "preserves AmountDisplay's existing nonnegative and privacy behavior: $value/$invertColor",
    (test) => {
      render(
        <FormattingProvider locale="en-US">
          <AmountDisplay
            value={test.value}
            currency="USD"
            colorFormat
            invertColor={test.invertColor}
            isHidden
          />
        </FormattingProvider>,
      );
      expect(screen.getByText("••••")).toHaveClass(test.color);
      expect(screen.queryByText(/\$/)).toBeNull();
    },
  );

  it("masks currency amounts at startup and updates from the shared privacy event", () => {
    localStorage.setItem("privacy-settings", "true");
    render(
      <FormattingProvider locale="en-US">
        <GainAmount value={321.45} currency="USD" data-testid="private-amount" />
      </FormattingProvider>,
    );
    expect(screen.getByTestId("private-amount")).toHaveTextContent("••••");
    expect(screen.getByTestId("private-amount")).not.toHaveTextContent("321");
    act(() => {
      window.dispatchEvent(
        new CustomEvent("wf:privacy-changed", { detail: { isBalanceHidden: false } }),
      );
    });
    expect(screen.getByTestId("private-amount")).toHaveTextContent("+$321.45");
  });
});
