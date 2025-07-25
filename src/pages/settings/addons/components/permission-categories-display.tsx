import { Badge } from '@/components/ui/badge';
import type { Permission, FunctionPermission } from '@/adapters/tauri';
import { getPermissionCategory } from '@wealthfolio/addon-sdk';

interface PermissionForDisplay {
  category: string;
  name: string;
  description: string;
  riskLevel: string;
  functions: FunctionPermission[];
  purpose: string;
}

interface PermissionCategoriesDisplayProps {
  permissions: Permission[];
  variant?: 'default' | 'compact';
}

// Helper to convert SDK Permission to display format
const convertToDisplayPermission = (permission: Permission): PermissionForDisplay => {
  const category = getPermissionCategory(permission.category);
  return {
    category: permission.category,
    name: category?.name || permission.category.charAt(0).toUpperCase() + permission.category.slice(1),
    description: category?.description || permission.purpose,
    riskLevel: category?.riskLevel || 'medium',
    functions: permission.functions,
    purpose: permission.purpose,
  };
};

const getRiskBadgeColor = (riskLevel: string) => {
  switch (riskLevel) {
    case 'low':
      return 'border-green-200 text-green-600';
    case 'medium':
      return 'border-yellow-200 text-yellow-600';
    case 'high':
      return 'border-red-200 text-red-600';
    default:
      return 'border-gray-200 text-gray-600';
  }
};

const getFunctionBadgeVariant = (func: FunctionPermission) => {
  if (func.isDeclared && func.isDetected) {
    return 'default'; // Declared and detected
  } else if (func.isDeclared && !func.isDetected) {
    return 'outline'; // Declared but not detected
  } else if (!func.isDeclared && func.isDetected) {
    return 'destructive'; // Detected but not declared (security concern)
  }
  return 'outline'; // Fallback
};

const getFunctionBadgeLabel = (func: FunctionPermission) => {
  if (func.isDeclared && func.isDetected) {
    return 'Declared & Detected';
  } else if (func.isDeclared && !func.isDetected) {
    return 'Declared Only';
  } else if (!func.isDeclared && func.isDetected) {
    return 'Detected Only';
  }
  return 'Unknown';
};

export function PermissionCategoriesDisplay({
  permissions,
  variant = 'default',
}: PermissionCategoriesDisplayProps) {
  const isCompact = variant === 'compact';
  
  if (permissions.length === 0) {
    return (
      <div className={`text-muted-foreground bg-muted/30 p-3 rounded-lg ${
        isCompact ? 'text-sm p-2' : 'text-sm'
      }`}>
        No data access permissions detected. This addon appears to have minimal system access.
      </div>
    );
  }

  // Convert SDK permissions to display format
  const displayPermissions = permissions.map(convertToDisplayPermission);
  
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <h4 className={`font-medium ${isCompact ? 'text-sm' : ''}`}>
          Data Access Permissions
        </h4>
        <div className="space-y-2">
          {displayPermissions.map((permission) => (
            <div
              key={permission.category}
              className={`flex items-start gap-3 p-3 bg-muted/30 rounded-lg ${
                isCompact ? 'p-2' : ''
              }`}
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${isCompact ? 'text-sm' : 'text-sm'}`}>
                    {permission.name}
                  </span>
                  <Badge
                    variant="outline"
                    className={getRiskBadgeColor(permission.riskLevel)}
                  >
                    {permission.riskLevel}
                  </Badge>
                </div>
                <p className={`text-muted-foreground ${isCompact ? 'text-xs' : 'text-xs'}`}>
                  {permission.description}
                </p>
                {permission.functions.length > 0 && (
                  <div className="space-y-2 mt-2">
                    <p className="text-xs text-muted-foreground font-medium">Functions:</p>
                    <div className="flex flex-wrap gap-1">
                      {permission.functions.map((func: FunctionPermission) => (
                        <div key={func.name} className="flex items-center gap-1">
                          <Badge 
                            variant="secondary" 
                            className={isCompact ? 'text-xs' : 'text-xs'}
                          >
                            {func.name}
                          </Badge>
                          <Badge
                            variant={getFunctionBadgeVariant(func)}
                            className="text-xs"
                          >
                            {getFunctionBadgeLabel(func)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
