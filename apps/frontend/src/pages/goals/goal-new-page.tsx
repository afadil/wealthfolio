import type { GoalType, PlannerMode } from "@/lib/types";
import { Button, Page, PageContent, PageHeader } from "@wealthfolio/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGoalMutations } from "./hooks/use-goals";

const COVER_IMAGES: Record<string, string> = {
  retirement: "/goals/retirement.png",
  home: "/goals/house.png",
  education: "/goals/education.png",
};

const GOAL_TEMPLATES: {
  type: GoalType;
  title: string;
  description: string;
  icon: React.ReactNode;
  defaultTarget: number;
  requiresPlannerMode?: boolean;
}[] = [
  {
    type: "retirement",
    title: "Retirement",
    description: "Plan your path to financial independence and retirement",
    icon: <Icons.Target className="h-6 w-6" />,
    defaultTarget: 0,
    requiresPlannerMode: true,
  },
  {
    type: "education",
    title: "Education",
    description: "Save for tuition, courses, or educational expenses",
    icon: <Icons.Briefcase className="h-6 w-6" />,
    defaultTarget: 50000,
  },
  {
    type: "home",
    title: "Home",
    description: "Save for a down payment or home purchase",
    icon: <Icons.Home className="h-6 w-6" />,
    defaultTarget: 100000,
  },
  {
    type: "wedding",
    title: "Wedding",
    description: "Plan and save for your special day",
    icon: <Icons.Star className="h-6 w-6" />,
    defaultTarget: 30000,
  },
  {
    type: "emergency_fund",
    title: "Emergency Fund",
    description: "Build a financial safety net for unexpected expenses",
    icon: <Icons.ShieldCheck className="h-6 w-6" />,
    defaultTarget: 10000,
  },
  {
    type: "custom_save_up",
    title: "Custom Savings",
    description: "Create a custom savings goal for any purpose",
    icon: <Icons.Wallet className="h-6 w-6" />,
    defaultTarget: 10000,
  },
];

export default function GoalNewPage() {
  const navigate = useNavigate();
  const { createMutation } = useGoalMutations();
  const [selectedType, setSelectedType] = useState<GoalType | null>(null);
  const [plannerMode, setPlannerMode] = useState<PlannerMode>("fire");

  const template = GOAL_TEMPLATES.find((t) => t.type === selectedType);

  const handleCreate = () => {
    if (!selectedType || !template) return;

    createMutation.mutate(
      {
        goalType: selectedType,
        title: template.title,
        description: template.description,
        targetAmount: template.defaultTarget,
        isAchieved: false,
        coverImageKey: selectedType,
      },
      {
        onSuccess: (goal) => {
          // For retirement goals, we'll set up the plan in the detail page
          if (selectedType === "retirement") {
            navigate(`/goals/${goal.id}?setup=true&mode=${plannerMode}`);
          } else {
            navigate(`/goals/${goal.id}?setup=true`);
          }
        },
      },
    );
  };

  return (
    <Page>
      <PageHeader
        heading="Create a Goal"
        text="Choose a goal type to get started"
        onBack={() => navigate("/goals")}
      />
      <PageContent>
        {!selectedType ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {GOAL_TEMPLATES.map((tmpl) => {
              const coverSrc = COVER_IMAGES[tmpl.type];
              return (
                <div
                  key={tmpl.type}
                  className="border-border/60 bg-card hover:border-border shadow-xs group cursor-pointer overflow-hidden rounded-xl border transition-all hover:shadow-md"
                  onClick={() => setSelectedType(tmpl.type)}
                >
                  {coverSrc ? (
                    <div className="relative h-36 overflow-hidden sm:h-40">
                      <img
                        src={coverSrc}
                        alt={tmpl.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/30 to-transparent" />
                      <div className="absolute bottom-3 left-4">
                        <p className="text-sm font-semibold text-white drop-shadow-md">
                          {tmpl.title}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-secondary/40 flex h-36 items-center justify-center sm:h-40">
                      <div className="text-muted-foreground/25">{tmpl.icon}</div>
                    </div>
                  )}
                  <CardHeader className="pb-4">
                    {!coverSrc && <CardTitle className="text-base">{tmpl.title}</CardTitle>}
                    <CardDescription className="text-xs leading-relaxed">
                      {tmpl.description}
                    </CardDescription>
                  </CardHeader>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mx-auto max-w-md space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full">
                    {template?.icon}
                  </div>
                  <div>
                    <CardTitle className="text-base">{template?.title}</CardTitle>
                    <CardDescription className="text-xs">{template?.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              {template?.requiresPlannerMode && (
                <CardContent className="space-y-3">
                  <p className="text-sm font-medium">Choose your planning approach:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Card
                      className={`cursor-pointer p-3 transition-colors ${
                        plannerMode === "fire"
                          ? "border-primary bg-primary/5"
                          : "hover:border-muted-foreground"
                      }`}
                      onClick={() => setPlannerMode("fire")}
                    >
                      <p className="text-sm font-medium">FIRE</p>
                      <p className="text-muted-foreground text-xs">
                        Financial Independence, Retire Early
                      </p>
                    </Card>
                    <Card
                      className={`cursor-pointer p-3 transition-colors ${
                        plannerMode === "traditional"
                          ? "border-primary bg-primary/5"
                          : "hover:border-muted-foreground"
                      }`}
                      onClick={() => setPlannerMode("traditional")}
                    >
                      <p className="text-sm font-medium">Traditional</p>
                      <p className="text-muted-foreground text-xs">
                        Sustainable retirement at target age
                      </p>
                    </Card>
                  </div>
                </CardContent>
              )}
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setSelectedType(null)}>
                Back
              </Button>
              <Button className="flex-1" onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Goal"}
              </Button>
            </div>
          </div>
        )}
      </PageContent>
    </Page>
  );
}
