import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icons,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wealthfolio/ui";
import { useState } from "react";
import type { CategoryRuleWithNames } from "@/lib/types";

interface RuleItemProps {
  rule: CategoryRuleWithNames;
  onEdit: (rule: CategoryRuleWithNames) => void;
  onDelete: (rule: CategoryRuleWithNames) => void;
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  contains: "Contains",
  starts_with: "Starts with",
  exact: "Exact",
  regex: "Regex",
};

export function RuleItem({ rule, onEdit, onDelete }: RuleItemProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = () => {
    onDelete(rule);
    setShowDeleteDialog(false);
  };

  return (
    <>
      <div className="hover:bg-muted/30 flex items-center justify-between px-4 py-3 transition-colors">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{rule.name}</span>
            <Badge variant="outline" className="text-xs">
              {MATCH_TYPE_LABELS[rule.matchType] ?? rule.matchType}
            </Badge>
            {rule.priority > 0 && (
              <Badge variant="secondary" className="text-xs">
                Priority: {rule.priority}
              </Badge>
            )}
          </div>
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <code className="bg-muted rounded px-1.5 py-0.5 text-xs">{rule.pattern}</code>
            <Icons.ArrowRight className="h-3 w-3" />
            <span>
              {rule.categoryName}
              {rule.subCategoryName && ` / ${rule.subCategoryName}`}
            </span>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Icons.MoreVertical className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(rule)}>
              <Icons.Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Icons.Trash className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the rule &quot;{rule.name}&quot;? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
