import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SellForm } from "../sell-form";
import type { AccountSelectOption } from "../fields";

// Mock useSettings hook to avoid AuthProvider dependency
vi.mock("@/hooks/use-settings", () => ({
  useSettings: () => ({
    data: { baseCurrency: "USD" },
    isLoading: false,
    error: null,
  }),
}));

// Mock the useHoldings hook
vi.mock("@/hooks/use-holdings", () => ({
  useHoldings: () => ({
    holdings: [],
    isLoading: false,
  }),
}));

// Mock the fields components
vi.mock("../fields", () => ({
  AccountSelect: ({ name, accounts }: { name: string; accounts: AccountSelectOption[] }) => (
    <select data-testid={`select-${name}`} name={name}>
      <option value="">Select account...</option>
      {accounts.map((acc) => (
        <option key={acc.value} value={acc.value}>
          {acc.label}
        </option>
      ))}
    </select>
  ),
  SymbolSearch: ({ name }: { name: string }) => (
    <input data-testid={`symbol-search-${name}`} name={name} />
  ),
  DatePicker: ({ name, label }: { name: string; label: string }) => (
    <div data-testid={`date-picker-${name}`}>{label}</div>
  ),
  AmountInput: ({ name, label }: { name: string; label: string }) => (
    <div>
      <label htmlFor={name}>{label}</label>
      <input data-testid={`input-${name}`} name={name} type="number" id={name} />
    </div>
  ),
  QuantityInput: ({ name, label }: { name: string; label: string }) => (
    <div>
      <label htmlFor={name}>{label}</label>
      <input data-testid={`input-${name}`} name={name} type="number" id={name} />
    </div>
  ),
  NotesInput: ({ name, label }: { name: string; label: string }) => (
    <div>
      <label htmlFor={name}>{label}</label>
      <textarea data-testid={`textarea-${name}`} name={name} id={name} />
    </div>
  ),
  AdvancedOptionsSection: () => <div data-testid="advanced-options-section" />,
}));

// Mock UI components
vi.mock("@wealthfolio/ui/components/ui/button", () => ({
  Button: ({
    children,
    type,
    onClick,
    disabled,
    variant,
  }: {
    children: React.ReactNode;
    type?: string;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
  }) => (
    <button
      type={type as "submit" | "button"}
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
    >
      {children}
    </button>
  ),
}));

vi.mock("@wealthfolio/ui/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-content">{children}</div>
  ),
}));

vi.mock("@wealthfolio/ui/components/ui/alert", () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div data-testid="alert">{children}</div>,
  AlertDescription: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-description">{children}</div>
  ),
}));

vi.mock("@wealthfolio/ui/components/ui/icons", () => ({
  Icons: {
    Spinner: () => <span data-testid="spinner">Loading...</span>,
    Check: () => <span data-testid="check-icon">Check</span>,
    Plus: () => <span data-testid="plus-icon">Plus</span>,
    AlertTriangle: () => <span data-testid="alert-triangle">Warning</span>,
  },
}));

const mockAccounts: AccountSelectOption[] = [
  { value: "acc-1", label: "Savings Account", currency: "USD" },
  { value: "acc-2", label: "Investment Account", currency: "EUR" },
];

describe("SellForm", () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Render Tests", () => {
    it("renders all form fields", () => {
      render(<SellForm accounts={mockAccounts} onSubmit={mockOnSubmit} />);

      expect(screen.getByTestId("select-accountId")).toBeInTheDocument();
      expect(screen.getByTestId("symbol-search-assetId")).toBeInTheDocument();
      expect(screen.getByTestId("date-picker-activityDate")).toBeInTheDocument();
      expect(screen.getByTestId("input-quantity")).toBeInTheDocument();
      expect(screen.getByTestId("input-unitPrice")).toBeInTheDocument();
      expect(screen.getByTestId("input-fee")).toBeInTheDocument();
      // Amount is now calculated and displayed as text, not as an input field
      expect(screen.getByTestId("textarea-comment")).toBeInTheDocument();
    });

    it("renders submit button with correct text for new sell", () => {
      render(<SellForm accounts={mockAccounts} onSubmit={mockOnSubmit} />);

      expect(screen.getByRole("button", { name: /add sell/i })).toBeInTheDocument();
    });

    it("renders submit button with correct text when editing", () => {
      render(<SellForm accounts={mockAccounts} onSubmit={mockOnSubmit} isEditing={true} />);

      expect(screen.getByRole("button", { name: /update/i })).toBeInTheDocument();
    });

    it("renders cancel button when onCancel is provided", () => {
      render(<SellForm accounts={mockAccounts} onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    });

    it("does not render cancel button when onCancel is not provided", () => {
      render(<SellForm accounts={mockAccounts} onSubmit={mockOnSubmit} />);

      expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    });

    it("shows loading spinner when isLoading is true", () => {
      render(<SellForm accounts={mockAccounts} onSubmit={mockOnSubmit} isLoading={true} />);

      expect(screen.getByTestId("spinner")).toBeInTheDocument();
    });

    it("disables submit button when isLoading is true", () => {
      render(<SellForm accounts={mockAccounts} onSubmit={mockOnSubmit} isLoading={true} />);

      const submitButton = screen.getByRole("button", { name: /add sell/i });
      expect(submitButton).toBeDisabled();
    });
  });

  describe("Cancel Button", () => {
    it("calls onCancel when cancel button is clicked", async () => {
      const user = userEvent.setup();
      render(<SellForm accounts={mockAccounts} onSubmit={mockOnSubmit} onCancel={mockOnCancel} />);

      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
    });

    it("disables cancel button when isLoading is true", () => {
      render(
        <SellForm
          accounts={mockAccounts}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isLoading={true}
        />,
      );

      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      expect(cancelButton).toBeDisabled();
    });
  });

  describe("Form Structure", () => {
    it("wraps content in a Card component", () => {
      render(<SellForm accounts={mockAccounts} onSubmit={mockOnSubmit} />);

      expect(screen.getByTestId("card")).toBeInTheDocument();
      expect(screen.getByTestId("card-content")).toBeInTheDocument();
    });

    it("renders form with proper structure", () => {
      const { container } = render(<SellForm accounts={mockAccounts} onSubmit={mockOnSubmit} />);

      const form = container.querySelector("form");
      expect(form).toBeInTheDocument();
    });
  });

  describe("Loading State", () => {
    it("shows check icon when editing and not loading", () => {
      render(<SellForm accounts={mockAccounts} onSubmit={mockOnSubmit} isEditing={true} />);

      expect(screen.getByTestId("check-icon")).toBeInTheDocument();
    });

    it("shows plus icon when creating new and not loading", () => {
      render(<SellForm accounts={mockAccounts} onSubmit={mockOnSubmit} isEditing={false} />);

      expect(screen.getByTestId("plus-icon")).toBeInTheDocument();
    });
  });
});
