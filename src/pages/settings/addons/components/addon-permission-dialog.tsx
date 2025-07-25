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
import { Icons } from '@/components/icons';
import { Separator } from '@/components/ui/separator';
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

const getRiskLevelColor = (riskLevel: RiskLevel) => {
  switch (riskLevel) {
    case 'low':
      return 'text-green-600 bg-green-50 border-green-200';
    case 'medium':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    case 'high':
      return 'text-red-600 bg-red-50 border-red-200';
  }
};

const getRiskLevelIcon = (riskLevel: RiskLevel) => {
  switch (riskLevel) {
    case 'low':
      return <Icons.Check className="h-4 w-4" />;
    case 'medium':
      return <Icons.AlertTriangle className="h-4 w-4" />;
    case 'high':
      return <Icons.AlertTriangle className="h-4 w-4" />;
  }
};

export function PermissionDialog({
  open,
  onOpenChange,
  manifest,
  declaredPermissions = [],
  riskLevel,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icons.Settings className="h-5 w-5" />
            {isViewOnly ? 'Addon Permissions' : 'Addon Permission Request'}
          </DialogTitle>
          <DialogDescription>
            {isViewOnly 
              ? 'View the permissions and data access for this installed addon.'
              : 'Review the permissions requested by this addon before installation.'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Addon Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold">{manifest.name}</h3>
              <Badge variant="outline">v{manifest.version}</Badge>
            </div>
            
            {manifest.description && (
              <p className="text-sm text-muted-foreground">
                {manifest.description}
              </p>
            )}
            
            {manifest.author && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icons.Users className="h-4 w-4" />
                <span>By {manifest.author}</span>
              </div>
            )}
          </div>

          <Separator />

          {/* Risk Level */}
          <div className="space-y-3">
            <h4 className="font-medium">Risk Assessment</h4>
            <div className={`flex items-center gap-2 p-3 rounded-lg border ${getRiskLevelColor(riskLevel)}`}>
              {getRiskLevelIcon(riskLevel)}
              <span className="font-medium capitalize">{riskLevel} Risk</span>
              <span className="text-sm">
                {riskLevel === 'low' && 'This addon has minimal access to sensitive data.'}
                {riskLevel === 'medium' && 'This addon has moderate access to your financial data.'}
                {riskLevel === 'high' && 'This addon has extensive access to sensitive financial data.'}
              </span>
            </div>
          </div>

          {/* Data Access Permissions using shared component */}
          <PermissionCategoriesDisplay
            permissions={permissionsToDisplay}
            variant="default"
          />

          {/* Warning for high-risk addons */}
          {riskLevel === 'high' && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <Icons.AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-medium text-red-800">High-Risk Addon</div>
                  <p className="text-sm text-red-700">
                    This addon can access sensitive financial data including transactions, 
                    account information, and application settings. Only install if you trust 
                    the author and understand the risks.
                  </p>
                </div>
              </div>
            </div>
          )}
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
