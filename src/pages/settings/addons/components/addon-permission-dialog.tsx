import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icons } from '@/components/ui/icons';
import { AlertFeedback } from '@wealthfolio/ui';
import type { AddonManifest, PermissionCategory, Permission, RiskLevel } from '@wealthfolio/addon-sdk';
import { PermissionCategoriesDisplay } from './permission-categories-display';

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

const getWarningVariantByFunctionCount = (functionCount: number): 'success' | 'warning' | 'error' => {
  if (functionCount <= 3) {
    return 'success';
  } else if (functionCount <= 8) {
    return 'warning';
  } else {
    return 'error';
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
  const permissionsToDisplay = isViewOnly ? declaredPermissions : (manifest.permissions || []);

  // Calculate total function count from all permissions (excluding UI category)
  const totalFunctionCount = permissionsToDisplay.reduce((total, permission) => {
    // Exclude 'ui' category from the count as it's low risk
    if (permission.category === 'ui') {
      return total;
    }
    return total + permission.functions.length;
  }, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Icons.Settings className="h-5 w-5" />
            <div className="flex items-center gap-3">
              <span>{manifest.name}</span>
              <Badge variant="outline">v{manifest.version}</Badge>
               {manifest.author && (
              <Badge variant="outline" className="flex items-center gap-1">
                <Icons.Users className="h-3 w-3" />
                <span>By {manifest.author}</span>
              </Badge>
            )}
            </div>
          </DialogTitle>
          <DialogDescription className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {manifest.description && (
              <p className="text-sm text-muted-foreground">
                {manifest.description}
              </p>
            )}
          </div>
            <div className="font-light">
              {isViewOnly 
                ? 'View the permissions and data access for this installed addon.'
                : 'Review the permissions requested by this addon before installation.'
              }
            </div>
            
        </DialogDescription>
      </DialogHeader>

        <div className="flex-1 overflow-hidden space-y-6">
          {/* Function Count Warning */}
          <div className="space-y-3">
            <AlertFeedback
              variant={getWarningVariantByFunctionCount(totalFunctionCount)}
            >
              {totalFunctionCount <= 3 && 'This addon has minimal access to your data.'}
              {totalFunctionCount > 3 && totalFunctionCount <= 8 && 'This addon has moderate access to your financial data.'}
              {totalFunctionCount > 8 && 'This addon has extensive access to sensitive financial data.'}
            </AlertFeedback>
          </div>

          {/* Data Access Permissions using shared component - Make scrollable */}
          <div className="flex-1 overflow-auto">
            <PermissionCategoriesDisplay
              permissions={permissionsToDisplay}
              variant="no-risk-badges"
            />
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
