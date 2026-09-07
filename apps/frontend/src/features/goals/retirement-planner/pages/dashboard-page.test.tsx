import { fireEvent, render, screen, within } from "@testing-library/react";
import { FormattingProvider } from "@wealthfolio/ui";
import { TooltipProvider } from "@wealthfolio/ui/components/ui/tooltip";
import { describe, expect, it, vi } from "vitest";
import type { RetirementOverview } from "@/lib/types";
import { DEFAULT_RETIREMENT_PLAN } from "../lib/plan-adapter";
import DashboardPage from "./dashboard-page";

vi.mock("../components/sidebar-configurator", () => ({ SidebarConfigurator: () => null }));
vi.mock("../components/retirement-snapshot-table", () => ({ RetirementSnapshotTable: () => null }));

function renderOverview(lean: number | null, fat: number | null) {
  const overview = {
    analysisMode: "fire",
    status: "on_track",
    successStatus: "on_track",
    fiAge: 50,
    retirementStartAge: 50,
    portfolioNow: 100_000,
    portfolioAtGoalAge: 400_000,
    netFireTarget: 500_000,
    requiredCapitalAtGoalAge: 400_000,
    requiredCapitalReachable: true,
    leanRequiredCapitalAtGoalAge: lean,
    fatRequiredCapitalAtGoalAge: fat,
    shortfallAtGoalAge: 0,
    surplusAtGoalAge: 0,
    coastAmountToday: 50_000,
    targetReconciliation: {
      inflationFactorToTarget: 2,
      requiredCapitalNominal: 400_000,
      requiredCapitalTodayValue: 200_000,
    },
    trajectory: [],
  } as unknown as RetirementOverview;
  render(
    <FormattingProvider locale="en-US">
      <TooltipProvider>
        <DashboardPage
          plan={DEFAULT_RETIREMENT_PLAN}
          plannerMode="fire"
          isLoading={false}
          portfolioData={{ totalValue: 100_000, holdings: [], isLoading: false, error: null }}
          retirementOverview={overview}
        />
      </TooltipProvider>
    </FormattingProvider>,
  );
}
function milestone(name: string) {
  return within(screen.getByText(name, { exact: true }).closest<HTMLElement>(".p-4")!);
}

describe("retirement spending milestones", () => {
  it("uses calculated scenario targets and converts their value basis", () => {
    renderOverview(120_000, 800_000);
    expect(milestone("Lean FIRE").getByText("$60K")).toBeInTheDocument();
    expect(milestone("Fat FIRE").getByText("$400K")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Nominal", { exact: true }));
    expect(milestone("Lean FIRE").getByText("$120K")).toBeInTheDocument();
    expect(milestone("Fat FIRE").getByText("$800K")).toBeInTheDocument();

  });

  it("distinguishes a valid zero target from an unavailable target", () => {
    renderOverview(0, null);
    expect(milestone("Lean FIRE").getByText("DONE")).toBeInTheDocument();
    expect(milestone("Fat FIRE").getByText("—")).toBeInTheDocument();
    expect(milestone("Fat FIRE").queryByText("DONE")).not.toBeInTheDocument();
  });
});
