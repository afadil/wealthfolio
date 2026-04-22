import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountForm } from "../account-form";

// Radix uses ResizeObserver which is not in jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock useAccountMutations to avoid real IPC/network calls
vi.mock("../use-account-mutations", () => ({
  useAccountMutations: () => ({
    createAccountMutation: { mutate: vi.fn(), mutateAsync: vi.fn() },
    updateAccountMutation: { mutate: vi.fn(), mutateAsync: vi.fn() },
  }),
}));

// Mock Dialog/AlertDialog wrappers (AccountForm is designed to live inside a Dialog)
vi.mock("@wealthfolio/ui/components/ui/dialog", () => ({
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@wealthfolio/ui/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

// Mock @wealthfolio/ui — keep real Form/RadioGroup but stub components with jsdom-incompatible deps
vi.mock("@wealthfolio/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@wealthfolio/ui")>();
  return {
    ...actual,
    // CurrencyInput uses Radix Select internally
    CurrencyInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
      <input
        data-testid="currency-input"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    ),
    // ResponsiveSelect uses Radix Sheet/Select
    ResponsiveSelect: ({
      value,
      onValueChange,
      placeholder,
    }: {
      value: string;
      onValueChange: (v: string) => void;
      placeholder: string;
    }) => (
      <select
        data-testid="account-type-select"
        value={value ?? ""}
        onChange={(e) => onValueChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        <option value="SECURITIES">Securities</option>
        <option value="CASH">Cash</option>
      </select>
    ),
  };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const baseDefaultValues = {
  name: "Test Account",
  accountType: "SECURITIES" as const,
  currency: "USD",
  trackingMode: "TRANSACTIONS" as const,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AccountForm – costBasisMethod field", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders FIFO, LIFO, and WAC radio options", () => {
    render(<AccountForm defaultValues={baseDefaultValues} />);

    expect(screen.getByRole("radio", { name: /FIFO/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /LIFO/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /WAC/i })).toBeInTheDocument();
  });

  it("defaults to FIFO selected for a new account", () => {
    render(<AccountForm defaultValues={baseDefaultValues} />);

    const fifoRadio = screen.getByRole("radio", { name: /FIFO/i });
    expect(fifoRadio).toHaveAttribute("aria-checked", "true");
  });

  it("shows descriptions for all three cost basis options", () => {
    render(<AccountForm defaultValues={baseDefaultValues} />);

    expect(screen.getByText(/First In, First Out/i)).toBeInTheDocument();
    expect(screen.getByText(/Last In, First Out/i)).toBeInTheDocument();
    expect(screen.getByText(/Weighted Average Cost/i)).toBeInTheDocument();
  });

  it("pre-selects LIFO when editing an account with LIFO", () => {
    const editValues = {
      id: "acc-123",
      name: "My Account",
      accountType: "SECURITIES" as const,
      currency: "USD",
      trackingMode: "TRANSACTIONS" as const,
      costBasisMethod: "LIFO" as const,
    };

    render(<AccountForm defaultValues={editValues} />);

    const lifoRadio = screen.getByRole("radio", { name: /LIFO/i });
    expect(lifoRadio).toHaveAttribute("aria-checked", "true");
  });

  it("renders the guidance Alert with a Learn more link pointing to cost-basis-methods docs", () => {
    render(<AccountForm defaultValues={baseDefaultValues} />);

    const links = screen.getAllByRole("link", { name: /learn more/i });
    const costBasisLink = links.find((el) =>
      (el as HTMLAnchorElement).href.includes("cost-basis-methods"),
    );
    expect(costBasisLink).toBeTruthy();
  });
});
