import { fireEvent, render, screen } from "@/test/render";
import { describe, expect, it, vi } from "vitest";
import { AlternativeAssetKind } from "@/lib/types";
import { AssetDetailsSheet, type AssetDetailsSheetAsset } from "./asset-details-sheet";

vi.mock("@/hooks/use-accounts", () => ({ useAccounts: () => ({ accounts: [] }) }));
vi.mock("../hooks/use-loan-calculation", () => ({
  useLoanSchedulePreview: () => ({ data: undefined, isLoading: false, error: null }),
}));

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  },
);

const loan: AssetDetailsSheetAsset = {
  id: "loan-a",
  name: "Mortgage",
  kind: AlternativeAssetKind.LIABILITY,
  currency: "USD",
  metadata: {
    sub_type: "mortgage",
    original_amount: "1200",
    origination_date: "2026-08-01",
    loan_projection: JSON.stringify({
      version: 1,
      annualRate: 0,
      frequency: "monthly",
      paymentAmount: 100,
      firstPaymentDate: "2026-09-01",
      amortizationEndDate: "2027-08-01",
    }),
  },
};

const props = { onOpenChange: vi.fn(), onSave: vi.fn() };
const originalAmount = () => screen.getByRole("textbox", { name: "Original amount" });

describe("AssetDetailsSheet unsaved edits", () => {
  it("keeps an unsaved edit when the parent re-renders with the same asset", () => {
    const view = render(<AssetDetailsSheet {...props} open asset={loan} />);
    fireEvent.change(originalAmount(), { target: { value: "1300" } });

    // Callers rebuild the asset object on every render, e.g. after a background
    // portfolio update; that must not discard what the user typed.
    view.rerender(<AssetDetailsSheet {...props} open asset={{ ...loan }} />);

    expect(originalAmount()).toHaveValue("1300");
  });

  it("loads the saved values again when the sheet is reopened", () => {
    const view = render(<AssetDetailsSheet {...props} open asset={loan} />);
    fireEvent.change(originalAmount(), { target: { value: "1300" } });

    view.rerender(<AssetDetailsSheet {...props} open={false} asset={loan} />);
    view.rerender(<AssetDetailsSheet {...props} open asset={{ ...loan }} />);

    expect(originalAmount()).toHaveValue("1200");
  });

  it("loads the other asset's values when it switches assets while open", () => {
    const view = render(<AssetDetailsSheet {...props} open asset={loan} />);
    fireEvent.change(originalAmount(), { target: { value: "1300" } });

    const other = {
      ...loan,
      id: "loan-b",
      metadata: { ...loan.metadata, original_amount: "5000" },
    };
    view.rerender(<AssetDetailsSheet {...props} open asset={other} />);

    expect(originalAmount()).toHaveValue("5000");
  });
});
