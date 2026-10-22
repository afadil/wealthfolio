import { fireEvent, render, screen, waitFor } from "@/test/render";
import { describe, expect, it, vi } from "vitest";
import { ChangeRateSheet } from "./change-rate-sheet";

const metadata = {
  loan_projection: {
    version: 1,
    annualRate: 4,
    paymentAmount: 1000,
    frequency: "monthly",
    firstPaymentDate: "2026-02-01",
    amortizationEndDate: "2046-01-01",
  },
  loan_events: [{ type: "rate_change", effectiveDate: "2026-03-01", annualRate: 4.5 }],
};

const open = (onSubmit = vi.fn().mockResolvedValue(undefined)) => {
  render(
    <ChangeRateSheet
      open
      onOpenChange={vi.fn()}
      interestRate={4.5}
      metadata={metadata}
      onSubmit={onSubmit}
    />,
  );
  return {
    onSubmit,
    save: screen.getByRole("button", { name: "Change interest rate" }),
    rate: screen.getByLabelText("Interest rate", { selector: "input" }),
    payment: screen.getByLabelText("Payment", { selector: "input" }),
  };
};

describe("change interest rate", () => {
  it("records nothing until the rate or the payment changes", () => {
    const { save, rate, payment } = open();
    expect(screen.getByText("Rate on this date: 4.5%")).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.change(rate, { target: { value: "5.1" } });
    expect(save).toBeEnabled();
    fireEvent.change(rate, { target: { value: "4.5" } });
    expect(save).toBeDisabled();
    fireEvent.change(payment, { target: { value: "1050" } });
    expect(save).toBeEnabled();
  });

  it("keeps the current payment unless one is entered", async () => {
    const { onSubmit, save, rate } = open();
    fireEvent.change(rate, { target: { value: "5.1" } });
    fireEvent.click(save);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.lastCall![0]).toMatchObject({ annualRate: 5.1 });
    expect(onSubmit.mock.lastCall![0].paymentAmount).toBeUndefined();
  });

  it("sends the payment from the lender's letter", async () => {
    const { onSubmit, save, rate, payment } = open();
    fireEvent.change(rate, { target: { value: "5.1" } });
    fireEvent.change(payment, { target: { value: "1050" } });
    fireEvent.click(save);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.lastCall![0]).toMatchObject({ annualRate: 5.1, paymentAmount: 1050 });
  });

  it("shows why a change was refused", async () => {
    const { save, rate } = open(vi.fn().mockRejectedValue(new Error("LOAN_INVALID")));
    fireEvent.change(rate, { target: { value: "5.1" } });
    fireEvent.click(save);
    expect(await screen.findByRole("alert")).toHaveTextContent("Check the date and values.");
  });
});
