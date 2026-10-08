import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { HoldingType } from "@/lib/constants";
import type { Holding } from "@/lib/types";
import { EligibleHoldingsSelector, type TargetCategories } from "./eligible-holdings-selector";
import { getEligibleHoldings, groupEligibleHoldings } from "./eligible-holdings";

if (typeof ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {
      return undefined;
    }
    unobserve() {
      return undefined;
    }
    disconnect() {
      return undefined;
    }
  } as typeof ResizeObserver;
}
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => undefined;
}

function holding(
  assetId: string,
  symbol: string,
  name: string,
  instrumentType?: string,
  holdingType: Holding["holdingType"] = HoldingType.SECURITY,
  currency = "USD",
  exchangeMic?: string,
  accountId = "account-1",
): Holding {
  return {
    id: `${assetId}-${symbol}-${accountId}`,
    accountId,
    holdingType,
    instrument: {
      id: assetId,
      symbol,
      name,
      currency,
      quoteMode: "MARKET",
      exchangeMic,
      instrumentType,
    },
  } as Holding;
}

const ACCOUNT_NAMES = new Map([
  ["account-1", "Brokerage"],
  ["account-2", "Retirement"],
]);

function Harness({
  holdings,
  categories,
  variant,
  rule,
  limits,
}: {
  holdings: Holding[];
  categories?: TargetCategories;
  variant?: "field" | "chip" | "card";
  rule?: string;
  limits?: string[];
}) {
  const [excludedAssetIds, setExcludedAssetIds] = useState<Set<string>>(new Set());
  return (
    <EligibleHoldingsSelector
      holdings={holdings}
      excludedAssetIds={excludedAssetIds}
      onToggle={(assetId) =>
        setExcludedAssetIds((previous) => {
          const next = new Set(previous);
          if (next.has(assetId)) next.delete(assetId);
          else next.add(assetId);
          return next;
        })
      }
      onSelectAll={() => setExcludedAssetIds(new Set())}
      onClear={() =>
        setExcludedAssetIds(new Set(getEligibleHoldings(holdings).map((row) => row.assetId)))
      }
      accountNames={ACCOUNT_NAMES}
      categories={categories}
      variant={variant}
      rule={rule}
      limits={limits}
    />
  );
}

describe("EligibleHoldingsSelector", () => {
  const holdings = [
    holding("asset-bond", "BND", "Bond fund", "BOND"),
    holding("asset-vti", "VTI", "Vanguard Total Stock", "EQUITY"),
    holding(
      "asset-vti",
      "VTI",
      "Vanguard Total Stock",
      "EQUITY",
      HoldingType.SECURITY,
      "USD",
      undefined,
      "account-2",
    ),
    holding("asset-unknown", "MYST", "Mystery asset"),
    holding("cash-usd", "USD", "Cash", undefined, HoldingType.CASH),
  ];

  it("selects each unique non-cash instrument initially and groups it by type", () => {
    render(<Harness holdings={holdings} />);

    expect(screen.getByRole("button", { name: /Eligible securities/ })).toHaveTextContent(
      "All securities selected",
    );

    expect(groupEligibleHoldings(getEligibleHoldings(holdings)).map((group) => group.key)).toEqual([
      "EQUITY",
      "BOND",
      "OTHER",
    ]);

    expect(screen.queryByText("Equity")).not.toBeInTheDocument();
  });

  it("says which accounts hold a security, merging its rows into one choice", async () => {
    const user = userEvent.setup();
    render(<Harness holdings={holdings} />);
    await user.click(screen.getByRole("button", { name: /Eligible securities/ }));

    expect(
      getEligibleHoldings(holdings).find((row) => row.assetId === "asset-vti")?.accountIds,
    ).toEqual(["account-1", "account-2"]);
    expect(screen.getByText("In Brokerage · Retirement")).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: /VTI/ })).toHaveLength(1);
  });

  it("announces selection state on the trigger and rows", async () => {
    const user = userEvent.setup();
    render(<Harness holdings={holdings} />);

    expect(
      screen.getByRole("button", { name: /Eligible securities.*All securities selected/i }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Eligible securities.*All securities selected/i }),
    );
    const vti = screen.getByRole("option", { name: /VTI.*selected/i });
    expect(vti).toHaveAccessibleName(/selected/i);

    await user.click(vti);
    expect(screen.getByRole("option", { name: /VTI.*not selected/i })).toBeInTheDocument();
  });

  it("opens grouped rows, searches by name, and toggles individual holdings", async () => {
    const user = userEvent.setup();
    render(<Harness holdings={holdings} />);
    await user.click(screen.getByRole("button", { name: /Eligible securities/ }));

    expect(screen.getByText("Equity")).not.toBeInstanceOf(HTMLButtonElement);
    expect(screen.getByText("Bond")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();

    const search = screen.getByPlaceholderText("Search securities");
    await user.type(search, "Vanguard");
    expect(screen.getByText("VTI")).toBeInTheDocument();
    expect(screen.queryByText("BND")).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /VTI.*Vanguard Total Stock/i }));
    expect(screen.getByRole("button", { name: /Eligible securities/ })).toHaveTextContent(
      "2 of 3 selected",
    );
  });

  it("disambiguates duplicate labels and reaches each row from the keyboard", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        holdings={[
          holding("asset-xnas", "ABC", "Acme Corp", "EQUITY", HoldingType.SECURITY, "USD", "XNAS"),
          holding("asset-xtse", "ABC", "Acme Corp", "EQUITY", HoldingType.SECURITY, "CAD", "XTSE"),
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Eligible securities/ }));
    expect(
      screen.getByRole("option", { name: /ABC.*Acme Corp.*XNAS.*USD.*selected/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /ABC.*Acme Corp.*XTSE.*CAD.*selected/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("XNAS · USD")).toBeInTheDocument();
    expect(screen.getByText("XTSE · CAD")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("option")
        .filter((option) => option.getAttribute("aria-selected") === "true"),
    ).toHaveLength(1);

    await user.click(screen.getByPlaceholderText("Search securities"));
    await user.keyboard("{ArrowDown}{Enter}");

    expect(
      screen.getByRole("option", { name: /ABC.*Acme Corp.*XTSE.*CAD.*not selected/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Eligible securities/ })).toHaveTextContent(
      "1 of 2 selected",
    );
  });

  it("supports Clear and Select all and explains the empty state", async () => {
    const user = userEvent.setup();
    render(<Harness holdings={holdings} />);
    await user.click(screen.getByRole("button", { name: /Eligible securities/ }));
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByRole("button", { name: /Eligible securities/ })).toHaveTextContent(
      "0 of 3 selected",
    );
    expect(
      screen.getByText(
        "No security selected. Increases that cannot be placed will show as unresolved amounts.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByRole("button", { name: /Eligible securities/ })).toHaveTextContent(
      "All securities selected",
    );
  });

  it("groups by the target's categories and says which one would be left unresolved", async () => {
    const user = userEvent.setup();
    const categories: TargetCategories = {
      order: [
        { id: "EQUITY", name: "Equity", isBelowTarget: false },
        { id: "FIXED_INCOME", name: "Fixed income", isBelowTarget: true },
      ],
      byAsset: new Map([
        ["asset-vti", ["EQUITY"]],
        ["asset-bond", ["FIXED_INCOME"]],
      ]),
    };
    render(<Harness holdings={holdings} categories={categories} />);
    await user.click(screen.getByRole("button", { name: /Eligible securities/ }));

    expect(screen.getByText("Equity · 1/1")).toBeInTheDocument();
    expect(screen.getByText("Fixed income · 1/1")).toBeInTheDocument();
    // A security the target does not classify sits apart.
    expect(screen.getByText("Not in this target's categories")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing eligible/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /BND.*Bond fund/i }));
    expect(screen.getByText("Fixed income · 0/1")).toBeInTheDocument();
    expect(
      screen.getByText("Nothing eligible: this category's share stays unresolved."),
    ).toBeInTheDocument();
  });

  it("as a card, shows the selection and changes it in place", async () => {
    const user = userEvent.setup();
    const categories: TargetCategories = {
      order: [
        { id: "FIXED_INCOME", name: "Fixed income", isBelowTarget: true },
        { id: "EQUITY", name: "Equity", isBelowTarget: false },
      ],
      byAsset: new Map([
        ["asset-vti", ["EQUITY"]],
        ["asset-bond", ["FIXED_INCOME"]],
      ]),
    };
    render(
      <Harness
        holdings={holdings}
        categories={categories}
        variant="card"
        rule="Split by what you hold."
        limits={["Whole units only"]}
      />,
    );

    // Folded, it says how many securities can receive changes and nothing more.
    const card = screen.getByRole("button", { name: /Eligible securities/ });
    expect(card).toHaveAttribute("aria-expanded", "false");
    expect(card).toHaveTextContent("3 of 3 selected");
    expect(screen.queryByText("Split by what you hold.")).not.toBeInTheDocument();

    await user.click(card);
    expect(screen.getByText("Split by what you hold.")).toBeInTheDocument();
    expect(screen.getByText("Whole units only")).toBeInTheDocument();
    expect(screen.getAllByRole("group").map((group) => group.getAttribute("aria-label"))).toEqual([
      "Fixed income · 1/1",
      "Equity · 1/1",
      "Not in this target's categories",
    ]);

    await user.click(screen.getByRole("checkbox", { name: /BND.*Bond fund/i }));
    expect(screen.getByRole("checkbox", { name: /BND.*Bond fund/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(card).toHaveTextContent("2 of 3 selected");
    expect(
      screen.getByText("Nothing eligible: this category's share stays unresolved."),
    ).toBeInTheDocument();
  });
});
