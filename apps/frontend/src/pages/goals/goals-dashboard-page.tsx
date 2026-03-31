import { Button, Page, PageContent, PageHeader, Skeleton } from "@wealthfolio/ui";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Link } from "react-router-dom";
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

function SectionHeader({
  children,
  count,
  className,
}: {
  children: React.ReactNode;
  count: number;
  className?: string;
}) {
  return (
    <div className="flex items-center gap-2 pb-3">
      <h2
        className={`text-xs font-semibold uppercase tracking-wider ${className ?? "text-muted-foreground"}`}
      >
        {children}
      </h2>
      <span className="bg-muted text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-medium">
        {count}
      </span>
    </div>
  );
}

export default function GoalsDashboardPage() {
  const { active, atRisk, achieved, archived, isLoading } = useGoals();

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

  const hasGoals =
    active.length > 0 || atRisk.length > 0 || achieved.length > 0 || archived.length > 0;

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
          <div className="space-y-10">
            {atRisk.length > 0 && (
              <section>
                <SectionHeader count={atRisk.length} className="text-amber-600 dark:text-amber-400">
                  Needs Attention
                </SectionHeader>
                <GoalGrid goals={atRisk} />
              </section>
            )}

            {active.length > 0 && (
              <section>
                <SectionHeader count={active.length}>Active</SectionHeader>
                <GoalGrid goals={active} />
              </section>
            )}

            {achieved.length > 0 && (
              <section>
                <SectionHeader count={achieved.length}>Achieved</SectionHeader>
                <GoalGrid goals={achieved} />
              </section>
            )}

            {archived.length > 0 && (
              <section>
                <SectionHeader count={archived.length}>Archived</SectionHeader>
                <GoalGrid goals={archived} />
              </section>
            )}
          </div>
        )}
      </PageContent>
    </Page>
  );
}
