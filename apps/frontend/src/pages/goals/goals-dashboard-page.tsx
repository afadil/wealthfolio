import { Button, Page, PageContent, PageHeader, Skeleton } from "@wealthfolio/ui";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Link } from "react-router-dom";
import { useState } from "react";
import { GoalCard } from "./components/goal-card";
import { useGoals } from "./hooks/use-goals";

function GoalGrid({ goals }: { goals: ReturnType<typeof useGoals>["active"] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {goals.map((goal) => (
        <GoalCard key={goal.id} goal={goal} />
      ))}
    </div>
  );
}

export default function GoalsDashboardPage() {
  const { active, atRisk, achieved, archived, isLoading } = useGoals();
  const [archivedOpen, setArchivedOpen] = useState(false);

  if (isLoading) {
    return (
      <Page>
        <PageHeader heading="Goals" text="Track and plan your financial goals" />
        <PageContent>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 w-full rounded-xl" />
            ))}
          </div>
        </PageContent>
      </Page>
    );
  }

  // Merge all non-archived goals into one flat list
  // Sort: priority DESC → nearest targetDate ASC (undated last) → createdAt ASC
  const allActive = [...atRisk, ...active, ...achieved].sort((a, b) => {
    const pDiff = (b.priority ?? 0) - (a.priority ?? 0);
    if (pDiff !== 0) return pDiff;
    const aDate = a.targetDate ? new Date(a.targetDate).getTime() : Infinity;
    const bDate = b.targetDate ? new Date(b.targetDate).getTime() : Infinity;
    if (aDate !== bDate) return aDate - bDate;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  const hasGoals = allActive.length > 0 || archived.length > 0;

  return (
    <Page>
      <PageHeader
        heading="Goals"
        text="Track and plan your financial goals"
        actions={
          <Link to="/goals/new">
            <Button size="sm">
              <Icons.Plus className="mr-1 h-4 w-4" />
              New Goal
            </Button>
          </Link>
        }
      />
      <PageContent>
        {!hasGoals ? (
          <div className="flex flex-col items-center justify-center gap-5 py-28 text-center">
            <div className="bg-muted/60 flex h-16 w-16 items-center justify-center rounded-2xl">
              <Icons.Target className="text-muted-foreground h-8 w-8" />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-semibold">No goals yet</p>
              <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
                Create your first financial goal — whether it's retirement, a home, education, or
                anything else you're saving toward.
              </p>
            </div>
            <Link to="/goals/new">
              <Button size="lg" className="mt-2">
                <Icons.Plus className="mr-2 h-4 w-4" />
                Create Your First Goal
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {allActive.length > 0 && <GoalGrid goals={allActive} />}

            {archived.length > 0 && (
              <section>
                <button
                  onClick={() => setArchivedOpen((o) => !o)}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-xs font-medium transition-colors"
                >
                  <Icons.ChevronRight
                    className={`h-3.5 w-3.5 transition-transform ${archivedOpen ? "rotate-90" : ""}`}
                  />
                  Archived ({archived.length})
                </button>
                {archivedOpen && (
                  <div className="mt-3">
                    <GoalGrid goals={archived} />
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </PageContent>
    </Page>
  );
}
