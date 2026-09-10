import { render, screen, waitFor } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AssetTaxonomyAssignment, TaxonomyCategory } from "@/lib/types";
import { SingleSelectTaxonomy } from "./single-select-taxonomy";

const mutate = vi.fn();
let assignments: AssetTaxonomyAssignment[] = [];

vi.mock("@/hooks/use-taxonomies", () => ({
  useTaxonomy: () => ({ data: { taxonomy: {}, categories }, isLoading: false }),
  useAssetTaxonomyAssignments: () => ({ data: assignments, isLoading: false }),
  useAssignAssetToCategory: () => ({ mutate, isPending: false }),
}));

function category(
  id: string,
  name: string,
  parentId: string | null,
  sortOrder: number,
): TaxonomyCategory {
  return {
    id,
    taxonomyId: "instrument_type",
    parentId,
    name,
    key: id,
    color: "#4385be",
    sortOrder,
    createdAt: "",
    updatedAt: "",
  };
}

// Trimmed instrument_type seed: the five quick-toggle ids are all containers, and
// the taxonomy needs more than MAX_RADIO_ITEMS categories to render as pills.
const categories: TaxonomyCategory[] = [
  category("EQUITY_SECURITY", "Stocks", null, 1),
  category("DEBT_SECURITY", "Bonds", null, 2),
  category("FUND", "Funds", null, 3),
  category("ETP", "ETFs", null, 4),
  category("OTHER", "Other", null, 11),
  category("STOCK_COMMON", "Stock", "EQUITY_SECURITY", 1),
  category("BOND_GOVERNMENT", "Government Bond", "DEBT_SECURITY", 1),
  category("FUND_MUTUAL", "Mutual Fund", "FUND", 1),
  category("ETF", "ETF", "ETP", 1),
  category("ETN", "ETN", "ETP", 2),
  category("OTHER_UNKNOWN", "Unknown Instrument", "OTHER", 1),
];

function assignment(categoryId: string, source: string): AssetTaxonomyAssignment {
  return {
    id: `assignment-${categoryId}`,
    assetId: "AAPL",
    taxonomyId: "instrument_type",
    categoryId,
    weight: 10000,
    source,
    createdAt: "",
    updatedAt: "",
  };
}

describe("SingleSelectTaxonomy quick toggles", () => {
  beforeEach(() => {
    mutate.mockClear();
    assignments = [];
  });

  it("assigns the chosen leaf rather than the pill's own container category", async () => {
    const user = userEvent.setup();
    render(<SingleSelectTaxonomy taxonomyId="instrument_type" assetId="AAPL" />);

    await user.click(screen.getByRole("button", { name: /ETFs/ }));
    await user.click(await screen.findByRole("button", { name: "ETN" }));

    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: "ETN", source: "manual" }),
    );
  });

  it("never writes a container id, because clicking a pill only opens its leaves", async () => {
    const user = userEvent.setup();
    render(<SingleSelectTaxonomy taxonomyId="instrument_type" assetId="AAPL" />);

    await user.click(screen.getByRole("button", { name: /ETFs/ }));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "ETF" })).toBeInTheDocument();
  });

  it("labels the pill with the assigned leaf so a container assignment stays visible", () => {
    assignments = [assignment("ETF", "auto")];
    const { unmount } = render(
      <SingleSelectTaxonomy taxonomyId="instrument_type" assetId="AAPL" />,
    );

    // Leaf assignment: the pill reads "ETF", not the container's "ETFs".
    expect(screen.getByRole("button", { name: /^ETF$/ })).toBeInTheDocument();
    unmount();

    // Container assignment, as the pre-fix pills wrote: still legible as "ETFs".
    assignments = [assignment("ETP", "manual")];
    render(<SingleSelectTaxonomy taxonomyId="instrument_type" assetId="AAPL" />);
    expect(screen.getByRole("button", { name: /ETFs/ })).toBeInTheDocument();
  });
});
