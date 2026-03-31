import type { Goal, GoalType } from "@/lib/types";
import { Button, Input, Label, MoneyInput } from "@wealthfolio/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wealthfolio/ui/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui/components/ui/select";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import { useGoalMutations } from "../hooks/use-goals";
import { useState } from "react";

const GOAL_TYPES: { value: GoalType; label: string }[] = [
  { value: "retirement", label: "Retirement" },
  { value: "education", label: "Education" },
  { value: "home", label: "Home" },
  { value: "wedding", label: "Wedding" },
  { value: "emergency_fund", label: "Emergency Fund" },
  { value: "custom_save_up", label: "Custom Savings" },
];

const LIFECYCLE_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "achieved", label: "Achieved" },
  { value: "archived", label: "Archived" },
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
  const [goalType, setGoalType] = useState(goal.goalType);
  const [targetAmount, setTargetAmount] = useState(goal.targetAmount ?? 0);
  const [targetDate, setTargetDate] = useState(goal.targetDate ?? "");
  const [currency, setCurrency] = useState(goal.currency ?? "USD");
  const [lifecycle, setLifecycle] = useState<string>(goal.statusLifecycle);
  const [isArchived, setIsArchived] = useState(goal.isArchived);

  const handleSave = () => {
    updateMutation.mutate(
      {
        ...goal,
        title,
        description: description || undefined,
        goalType: goalType as GoalType,
        targetAmount: targetAmount || undefined,
        targetDate: targetDate || undefined,
        currency: currency || undefined,
        statusLifecycle: lifecycle as Goal["statusLifecycle"],
        isArchived,
      },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Goal</DialogTitle>
          <DialogDescription>Update your goal details.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Goal Type</Label>
              <Select value={goalType} onValueChange={(v) => setGoalType(v as GoalType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={lifecycle} onValueChange={setLifecycle}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIFECYCLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Target Amount</Label>
              <MoneyInput
                value={targetAmount}
                onChange={(e) => setTargetAmount(Number(e.target.value))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Target Date</Label>
              <Input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
            </div>

            <div className="flex items-center gap-3 pt-6">
              <Switch checked={isArchived} onCheckedChange={setIsArchived} />
              <Label>Archived</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
