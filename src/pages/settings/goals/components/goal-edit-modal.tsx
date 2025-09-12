import { Dialog, DialogContent } from "@/components/ui/dialog";
import { GoalForm } from "./goal-form";
import type { Goal } from "@/lib/types";

export interface GoalEditModalProps {
  goal?: Goal;
  open?: boolean;
  onClose?: () => void;
}

export function GoalEditModal({ goal, open, onClose }: GoalEditModalProps) {
  const defaultValues = {
    id: goal?.id || undefined,
    title: goal?.title || "",
    description: goal?.description || "",
    targetAmount: goal?.targetAmount || 0,
    isAchieved: goal?.isAchieved || false,
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[625px]">
        <GoalForm defaultValues={defaultValues} onSuccess={onClose} />
      </DialogContent>
    </Dialog>
  );
}
