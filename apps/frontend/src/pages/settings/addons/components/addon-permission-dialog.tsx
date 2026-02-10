import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wealthfolio/ui/components/ui/dialog";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import type {
  AddonManifest,
  Permission,
  PermissionCategory,
  RiskLevel,
} from "@wealthfolio/addon-sdk";
import { AlertFeedback } from "@wealthfolio/ui";
import { PermissionCategoriesDisplay } from "./permission-categories-display";

interface PermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manifest?: AddonManifest;
  detectedCategories?: PermissionCategory[];
  declaredPermissions?: Permission[];
  riskLevel: RiskLevel;
  onApprove: () => void;
  onDeny: () => void;
  isViewOnly?: boolean;
}

const getWarningVariantByFunctionCount = (
  functionCount: number,
): "success" | "warning" | "error" => {
  if (functionCount <= 3) {
    return "success";
  } else if (functionCount <= 8) {
    return "warning";
  } else {
    return "error";
  }
};

export function PermissionDialog({
  open,
  onOpenChange,
  manifest,
  declaredPermissions = [],
  riskLevel: _riskLevel, // Keep in interface but not used in implementation
  onApprove,
  onDeny,
  isViewOnly = false,
}: PermissionDialogProps) {
  // Safety check - don't render if manifest is missing
  if (!manifest) {
    return null;
  }

  // For installation (not view-only), use manifest permissions
  // For view-only, use declared permissions passed in
  const permissionsToDisplay = isViewOnly ? declaredPermissions : manifest.permissions || [];

  // Calculate total function count from all permissions (excluding UI category)
  const totalFunctionCount = permissionsToDisplay.reduce((total, permission) => {
    // Exclude 'ui' category from the count as it's low risk
    if (permission.category === "ui") {
      return total;
    }
    return total + permission.functions.length;
  }, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex flex-col gap-3 md:flex-row md:items-center">
            <Icons.Settings className="hidden h-5 w-5 md:block" />
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
              <span className="text-base md:text-lg">{manifest.name}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline">v{manifest.version}</Badge>
                {manifest.author && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Icons.Users className="h-3 w-3" />
                    <span>By {manifest.author}</span>
                  </Badge>
                )}
              </div>
            </div>
          </DialogTitle>
          <DialogDescription className="space-y-2">
            <div className="text-muted-foreground text-sm">
              {manifest.description && (
                <p className="text-muted-foreground text-sm">{manifest.description}</p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-hidden">
          {/* Function Count Warning */}
          <div className="pt-8">
            <AlertFeedback variant={getWarningVariantByFunctionCount(totalFunctionCount)}>
              {totalFunctionCount <= 3 && "This addon has minimal access to your data."}
              {totalFunctionCount > 3 &&
                totalFunctionCount <= 8 &&
                "This addon has moderate access to your financial data."}
              {totalFunctionCount > 8 &&
                "This addon has extensive access to sensitive financial data."}
            </AlertFeedback>
          </div>

          {/* Data Access Permissions using shared component - Make scrollable */}
          <div className="flex-1 overflow-auto">
            <PermissionCategoriesDisplay permissions={permissionsToDisplay} />
          </div>
        </div>

        <DialogFooter className="gap-3">
          {isViewOnly ? (
            <Button onClick={onApprove}>
              <Icons.Check className="mr-2 h-4 w-4" />
              Close
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onDeny}>
                <Icons.Close className="mr-2 h-4 w-4" />
                Deny Installation
              </Button>
              <Button onClick={onApprove}>
                <Icons.Check className="mr-2 h-4 w-4" />
                Approve & Install
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
