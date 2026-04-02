import type { Goal, GoalType, PlannerMode } from "@/lib/types";
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
import { useGoalMutations, useGoals } from "./hooks/use-goals";
import { toast } from "sonner";

/** Cover image by convention: /goals/{goalType}.png */
function coverImageSrc(goalType: string): string {
  return `/goals/${goalType}.png`;
}

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
    title: "Home Purchase",
    description: "Save for a down payment or home purchase",
    icon: <Icons.Home className="h-6 w-6" />,
    defaultTarget: 100000,
  },
  {
    type: "car",
    title: "Car Purchase",
    description: "Save for your next vehicle purchase or down payment",
    icon: <Icons.Car className="h-6 w-6" />,
    defaultTarget: 40000,
  },
  {
    type: "wedding",
    title: "Wedding",
    description: "Plan and save for your special day",
    icon: <Icons.Star className="h-6 w-6" />,
    defaultTarget: 30000,
  },
  {
    type: "custom_save_up",
    title: "Savings Goal",
    description: "Create a custom savings goal for any purpose",
    icon: <Icons.Wallet className="h-6 w-6" />,
    defaultTarget: 10000,
  },
];

function hasRetirementGoal(goals: Goal[]): boolean {
  return goals.some((g) => g.goalType === "retirement" && !g.isArchived);
}

export default function GoalNewPage() {
  const navigate = useNavigate();
  const { createMutation } = useGoalMutations();
  const { goals } = useGoals();
  const [selectedType, setSelectedType] = useState<GoalType | null>(null);
  const [plannerMode, setPlannerMode] = useState<PlannerMode>("fire");

  const retirementExists = hasRetirementGoal(goals);
  const template = GOAL_TEMPLATES.find((t) => t.type === selectedType);

  const handleSelectType = (type: GoalType) => {
    if (type === "retirement" && retirementExists) {
      toast.error(
        "You already have an active retirement goal. Only one retirement goal is allowed.",
      );
      return;
    }
    setSelectedType(type);
  };

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
          if (selectedType === "retirement") {
            navigate(`/goals/${goal.id}?setup=true&mode=${plannerMode}`);
          } else {
            navigate(`/goals/${goal.id}?setup=true`);
          }
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : "Failed to create goal.";
          toast.error(message);
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
              const disabled = tmpl.type === "retirement" && retirementExists;
              return (
                <div
                  key={tmpl.type}
                  className={`border-border/60 bg-card shadow-xs group overflow-hidden rounded-xl border transition-all ${
                    disabled
                      ? "cursor-not-allowed opacity-50"
                      : "hover:border-border cursor-pointer hover:shadow-md"
                  }`}
                  onClick={() => handleSelectType(tmpl.type)}
                >
                  <div className="relative h-36 overflow-hidden sm:h-40">
                    <img
                      src={coverImageSrc(tmpl.type)}
                      alt={tmpl.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      onError={(e) => {
                        e.currentTarget.parentElement!.classList.add("goal-cover-fallback");
                        e.currentTarget.style.display = "none";
                      }}
                    />
                    <div className="bg-secondary/40 hidden h-full w-full items-center justify-center [.goal-cover-fallback>&]:flex">
                      <div className="text-muted-foreground/25">{tmpl.icon}</div>
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-3 left-4">
                      <p className="text-base font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
                        {tmpl.title}
                      </p>
                    </div>
                  </div>
                  <CardHeader className="pb-4">
                    <CardDescription className="text-xs leading-relaxed">
                      {tmpl.description}
                      {disabled && (
                        <span className="text-muted-foreground mt-1 block text-[11px]">
                          You already have a retirement goal.
                        </span>
                      )}
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
                  <p className="text-sm font-medium">Choose your analysis mode:</p>
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
                      className="relative cursor-not-allowed p-3 opacity-50"
                      aria-disabled="true"
                    >
                      <p className="text-sm font-medium">Traditional</p>
                      <p className="text-muted-foreground text-xs">
                        Sustainable retirement at target age
                      </p>
                      <span className="text-muted-foreground absolute right-2 top-2 text-[10px] font-medium uppercase tracking-wide">
                        Coming soon
                      </span>
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
