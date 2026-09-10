import { TooltipProvider } from "@wealthfolio/ui";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { TradeTotalInput } from "./trade-total-input";

interface HarnessProps {
  calculatedAmount?: number;
  initialAmount?: number;
  side?: "buy" | "sell";
}

/** Mirrors how the buy/sell forms own the custom latch. */
function Harness({ calculatedAmount, initialAmount, side = "buy" }: HarnessProps) {
  const form = useForm<{ amount?: number | null }>({ defaultValues: { amount: initialAmount } });
  const [isCustom, setIsCustom] = useState(initialAmount != null);

  return (
    <TooltipProvider>
      <FormProvider {...form}>
        <TradeTotalInput
          side={side}
          calculatedAmount={calculatedAmount}
          isCustom={isCustom}
          onCustomChange={setIsCustom}
          currency="USD"
        />
      </FormProvider>
    </TooltipProvider>
  );
}

const amountInput = () => screen.getByTestId("amount-input") as HTMLInputElement;

describe("TradeTotalInput", () => {
  it("fills a new trade with the calculated total", async () => {
    render(<Harness calculatedAmount={301} />);

    await waitFor(() => expect(amountInput().value).toBe("301"));
    expect(screen.queryByRole("button", { name: /use calculated total/i })).not.toBeInTheDocument();
  });

  it("follows the calculation while the total is not custom", async () => {
    const { rerender } = render(<Harness calculatedAmount={301} />);
    await waitFor(() => expect(amountInput().value).toBe("301"));

    rerender(<Harness calculatedAmount={401} />);
    await waitFor(() => expect(amountInput().value).toBe("401"));
  });

  it("stops following the calculation once the user edits the total", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness calculatedAmount={301} />);
    await waitFor(() => expect(amountInput().value).toBe("301"));

    await user.clear(amountInput());
    await user.type(amountInput(), "298.5");

    expect(
      await screen.findByRole("button", { name: /use calculated total/i }),
    ).toBeInTheDocument();

    rerender(<Harness calculatedAmount={401} />);
    expect(amountInput().value).toBe("298.5");
  });

  it("returns to calculated mode via the use-calculated action", async () => {
    const user = userEvent.setup();
    render(<Harness calculatedAmount={301} initialAmount={250} />);

    expect(amountInput().value).toBe("250");

    await user.click(screen.getByRole("button", { name: /use calculated total/i }));

    await waitFor(() => expect(amountInput().value).toBe("301"));
    expect(screen.queryByRole("button", { name: /use calculated total/i })).not.toBeInTheDocument();
  });

  it("labels the total by side", () => {
    const { unmount } = render(<Harness calculatedAmount={301} />);
    expect(screen.getByText("Total Debit")).toBeInTheDocument();
    unmount();

    render(<Harness calculatedAmount={301} side="sell" />);
    expect(screen.getByText("Total Credit")).toBeInTheDocument();
  });

  it("keeps an imported total when the trade details disagree with it", async () => {
    render(<Harness calculatedAmount={301} initialAmount={0.3} />);

    await waitFor(() => expect(amountInput().value).toBe("0.3"));
    expect(
      screen.getByRole("button", { name: "Use calculated total ($301.00)" }),
    ).toBeInTheDocument();
  });
});
