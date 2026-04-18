import type { Goal } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, Input, Label } from "@wealthfolio/ui";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wealthfolio/ui/components/ui/dialog";
import { Textarea } from "@wealthfolio/ui/components/ui/textarea";
import { useEffect, useState } from "react";
import { useGoalMutations } from "../hooks/use-goals";

const GOAL_TYPE_LABELS: Record<Goal["goalType"], string> = {
  retirement: "Retirement",
  education: "Education",
  home: "Home Purchase",
  car: "Car Purchase",
  wedding: "Wedding",
  custom_save_up: "Savings Goal",
};

const LIFECYCLE_OPTIONS: {
  value: Goal["statusLifecycle"];
  label: string;
  description: string;
}[] = [
  {
    value: "active",
    label: "Active",
    description: "Show in active planning and progress.",
  },
  {
    value: "achieved",
    label: "Achieved",
    description: "Mark complete and release its account shares.",
  },
  {
    value: "archived",
    label: "Archived",
    description: "Hide from active goals without deleting history.",
  },
];

interface Props {
  goal: Goal;
  open: boolean;
  onClose: () => void;
}

export function GoalEditDialog({ goal, open, onClose }: Props) {
  const { updateMutation } = useGoalMutations();
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description ?? "");
  const [lifecycle, setLifecycle] = useState<Goal["statusLifecycle"]>(goal.statusLifecycle);

  useEffect(() => {
    if (!open) return;
    setTitle(goal.title);
    setDescription(goal.description ?? "");
    setLifecycle(goal.statusLifecycle);
  }, [goal, open]);

  const isRetirement = goal.goalType === "retirement";
  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedTitle) return;

    updateMutation.mutate(
      {
        ...goal,
        title: trimmedTitle,
        description: trimmedDescription || undefined,
        statusLifecycle: lifecycle,
      },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={handleSave} className="space-y-6">
          <DialogHeader>
            <DialogTitle>Edit goal</DialogTitle>
            <DialogDescription>
              Update the goal name, notes, and lifecycle.{" "}
              {isRetirement
                ? "Retirement assumptions, spending, taxes, and account shares stay in the planner."
                : "Target amount, target date, and funding stay in the goal plan."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="bg-muted/30 rounded-xl border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Goal type</p>
                  <p className="text-muted-foreground text-xs">
                    Fixed after creation so the planner logic stays consistent.
                  </p>
                </div>
                <Badge variant="secondary">{GOAL_TYPE_LABELS[goal.goalType]}</Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-title">Title</Label>
              <Input
                id="goal-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Goal name"
                autoFocus
              />
              {!trimmedTitle && <p className="text-destructive text-xs">Title is required.</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal-description">Notes</Label>
              <Textarea
                id="goal-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional context for this goal"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Lifecycle</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {LIFECYCLE_OPTIONS.map((option) => {
                  const selected = lifecycle === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setLifecycle(option.value)}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        "focus-visible:ring-ring focus:outline-none focus-visible:ring-2",
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-border/70 bg-card hover:bg-accent",
                      )}
                    >
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="text-muted-foreground mt-1 block text-xs leading-relaxed">
                        {option.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending || !trimmedTitle}>
              {updateMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
