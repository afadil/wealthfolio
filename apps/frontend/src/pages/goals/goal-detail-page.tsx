import {
  Button,
  Page,
  PageContent,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@wealthfolio/ui";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { DeleteConfirm } from "@wealthfolio/ui/components/common";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  useGoalDetail,
  useGoalPlanMutations,
  useRetirementOverview,
  useSaveUpOverview,
} from "./hooks/use-goal-detail";
import { useGoalMutations } from "./hooks/use-goals";
import type { RetirementOverview } from "@/lib/types";
import type { RetirementPlan } from "@/pages/fire-planner/types";
import { parseSettingsJson, DEFAULT_RETIREMENT_PLAN } from "@/pages/fire-planner/lib/plan-adapter";
import { usePortfolioData } from "@/pages/fire-planner/hooks/use-portfolio";
import DashboardPage from "@/pages/fire-planner/pages/dashboard-page";
import SimulationsPage from "@/pages/fire-planner/pages/simulations-page";
import AllocationPage from "@/pages/fire-planner/pages/allocation-page";
import SettingsPage from "@/pages/fire-planner/pages/settings-page";
import SaveUpDetailPage from "./components/save-up-detail";
import { GoalFundingEditor } from "./components/goal-funding-editor";
import { GoalEditDialog } from "./components/goal-edit-dialog";

const GOAL_TYPE_LABELS: Record<string, string> = {
  retirement: "Retirement",
  education: "Education",
  home: "Home Purchase",
  car: "Car Purchase",
  wedding: "Wedding",
  custom_save_up: "Savings Goal",
};

export default function GoalDetailPage() {
  const { goalId } = useParams<{ goalId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isSetup = searchParams.get("setup") === "true";
  const setupMode = searchParams.get("mode");

  const { goal, plan, fundingRules, isLoading, error } = useGoalDetail(goalId);
  const { savePlanMutation } = useGoalPlanMutations(goalId ?? "");
  const { deleteMutation } = useGoalMutations();

  const isRetirement = goal?.goalType === "retirement";
  const isSaveUp = goal && !isRetirement;

  // Fetch backend-computed retirement overview when a retirement plan exists
  const { data: retirementOverview } = useRetirementOverview(
    isRetirement && plan ? goalId : undefined,
  );

  // Fetch backend-computed save-up overview when this is a save-up goal
  const { data: saveUpOverview } = useSaveUpOverview(isSaveUp ? goalId : undefined);

  // Derive eligible account IDs from funding rules (replaces includedAccountIds in settings)
  const eligibleAccountIds = useMemo(
    () => fundingRules.filter((r) => r.fundingRole === "residual_eligible").map((r) => r.accountId),
    [fundingRules],
  );

  // Parse retirement plan from settings JSON
  const retirementPlan: RetirementPlan = useMemo(() => {
    if (!plan?.settingsJson || plan.planKind !== "retirement") {
      return { ...DEFAULT_RETIREMENT_PLAN };
    }
    return parseSettingsJson(plan.settingsJson);
  }, [plan]);

  // DC-linked account IDs from retirement plan income streams
  const dcLinkedAccountIds = useMemo(() => {
    return retirementPlan.incomeStreams
      .filter((s) => s.streamType === "dc" && s.linkedAccountId)
      .map((s) => s.linkedAccountId!);
  }, [retirementPlan]);

  // Feed portfolio data from funding-rule-derived accounts
  const portfolioData = usePortfolioData(
    isRetirement ? (eligibleAccountIds.length > 0 ? eligibleAccountIds : undefined) : undefined,
  );

  // Default tab: plan if setup, overview otherwise
  const [activeTab, setActiveTab] = useState(isSetup ? "plan" : "overview");

  // On setup, auto-create the retirement plan
  const planCreationPending = savePlanMutation.isPending;
  useEffect(() => {
    if (isSetup && goalId && !plan && !planCreationPending) {
      if (isRetirement || setupMode) {
        const mode = (setupMode ?? "fire") as "fire" | "traditional";
        savePlanMutation.mutate({
          goalId,
          planKind: "retirement",
          plannerMode: mode,
          settingsJson: JSON.stringify({ ...DEFAULT_RETIREMENT_PLAN }),
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSetup, goalId, plan, isRetirement, setupMode, planCreationPending]);

  const handleSaveRetirementPlan = useCallback(
    (updated: RetirementPlan) => {
      if (!goalId) return;
      savePlanMutation.mutate(
        {
          goalId,
          planKind: "retirement",
          plannerMode: plan?.plannerMode ?? "fire",
          settingsJson: JSON.stringify(updated),
        },
        {
          onSuccess: () => {
            // Backend auto-refreshes summary after plan save
          },
        },
      );
    },
    [goalId, plan?.plannerMode, savePlanMutation],
  );

  const [editOpen, setEditOpen] = useState(false);

  const handleDelete = () => {
    if (!goalId) return;
    deleteMutation.mutate(goalId, {
      onSuccess: () => navigate("/goals"),
    });
  };

  if (isLoading) {
    return (
      <Page>
        <PageHeader heading="Loading..." />
        <PageContent>
          <Skeleton className="h-64 w-full" />
        </PageContent>
      </Page>
    );
  }

  if (error || !goal) {
    return (
      <Page>
        <PageHeader heading="Goal not found" />
        <PageContent>
          <div className="flex flex-col items-center gap-4 py-24">
            <p className="text-muted-foreground">This goal could not be found.</p>
            <Button onClick={() => navigate("/goals")}>Back to Goals</Button>
          </div>
        </PageContent>
      </Page>
    );
  }

  const typeLabel = GOAL_TYPE_LABELS[goal.goalType] ?? "Goal";

  return (
    <Page>
      <PageHeader
        heading={goal.title}
        text={goal.description ? `${typeLabel} goal · ${goal.description}` : `${typeLabel} goal`}
        onBack={() => navigate("/goals")}
        actions={
          <div className="flex items-center gap-2">
            {goal.statusLifecycle === "achieved" && <Badge variant="default">Achieved</Badge>}
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Icons.Settings2 className="mr-1 h-4 w-4" />
              Edit
            </Button>
            <DeleteConfirm
              deleteConfirmTitle="Delete goal"
              deleteConfirmMessage={`Are you sure you want to delete "${goal.title}"? This action cannot be undone.`}
              handleDeleteConfirm={handleDelete}
              isPending={deleteMutation.isPending}
              button={
                <Button variant="destructive" size="sm">
                  <Icons.Trash className="h-4 w-4" />
                </Button>
              }
            />
          </div>
        }
      />
      {goal && <GoalEditDialog goal={goal} open={editOpen} onClose={() => setEditOpen(false)} />}
      <PageContent>
        {isRetirement ? (
          plan ? (
            <RetirementDetail
              activeTab={activeTab}
              onTabChange={setActiveTab}
              plan={retirementPlan}
              portfolioData={portfolioData}
              onSavePlan={handleSaveRetirementPlan}
              plannerMode={(plan.plannerMode! as "fire" | "traditional") ?? "fire"}
              goalId={goalId!}
              dcLinkedAccountIds={dcLinkedAccountIds}
              retirementOverview={retirementOverview}
            />
          ) : (
            <div className="space-y-3">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-64 w-full" />
            </div>
          )
        ) : isSaveUp ? (
          <SaveUpDetailPage goal={goal} plan={plan} overview={saveUpOverview} />
        ) : (
          <div className="flex flex-col items-center gap-4 py-12">
            <p className="text-muted-foreground text-sm">
              This goal doesn&apos;t have a detailed plan yet.
            </p>
          </div>
        )}
      </PageContent>
    </Page>
  );
}

function RetirementDetail({
  activeTab,
  onTabChange,
  plan,
  portfolioData,
  onSavePlan,
  plannerMode,
  goalId,
  dcLinkedAccountIds,
  retirementOverview,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
  plan: RetirementPlan;
  portfolioData: ReturnType<typeof usePortfolioData>;
  onSavePlan: (p: RetirementPlan) => void;
  plannerMode: "fire" | "traditional";
  goalId: string;
  dcLinkedAccountIds: string[];
  retirementOverview?: RetirementOverview;
}) {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-4">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="plan">Plan</TabsTrigger>
        <TabsTrigger value="funding">Funding</TabsTrigger>
        <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
        <TabsTrigger value="allocation">Allocation</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <DashboardPage
          plan={plan}
          portfolioData={portfolioData}
          isLoading={portfolioData.isLoading}
          plannerMode={plannerMode}
          onSavePlan={onSavePlan}
          onNavigateToTab={onTabChange}
          retirementOverview={retirementOverview}
          goalId={goalId}
          dcLinkedAccountIds={dcLinkedAccountIds}
        />
      </TabsContent>

      <TabsContent value="plan">
        <SettingsPage
          plan={plan}
          onSave={onSavePlan}
          isSaving={false}
          holdings={portfolioData.holdings}
          accountIds={portfolioData.activeAccountIds}
          accounts={portfolioData.accounts}
          activeAccounts={portfolioData.activeAccounts}
        />
      </TabsContent>

      <TabsContent value="funding">
        <GoalFundingEditor
          goalId={goalId}
          goalType="retirement"
          dcLinkedAccountIds={dcLinkedAccountIds}
        />
      </TabsContent>

      <TabsContent value="scenarios">
        <SimulationsPage
          plan={plan}
          totalValue={portfolioData.totalValue}
          isLoading={portfolioData.isLoading}
          retirementOverview={retirementOverview}
          plannerMode={plannerMode}
          goalId={goalId}
        />
      </TabsContent>

      <TabsContent value="allocation">
        <AllocationPage
          plan={plan}
          holdings={portfolioData.holdings}
          accountIds={portfolioData.activeAccountIds}
          isLoading={portfolioData.isLoading}
          onSetupTargets={() => onTabChange("plan")}
        />
      </TabsContent>
    </Tabs>
  );
}
