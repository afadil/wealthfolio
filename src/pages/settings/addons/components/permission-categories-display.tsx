import { Badge } from '@/components/ui/badge';

export interface Permission {
  category: string;
  name: string;
  description: string;
  riskLevel: string;
  functions: string[];
  purpose: string;
  isDeclared: boolean;
  isDetected: boolean;
}

interface PermissionCategoriesDisplayProps {
  permissions: Permission[];
  variant?: 'default' | 'compact';
}

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

const getPermissionBadgeVariant = (isDeclared: boolean, isDetected: boolean) => {
  if (isDeclared && isDetected) {
    return 'info'; // Declared and detected
  } else if (isDeclared && !isDetected) {
    return 'outline'; // Declared but not detected
  } else if (!isDeclared && isDetected) {
    return 'warning'; // Detected but not declared
  }
  return 'outline'; // Fallback
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
  
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <h4 className={`font-medium ${isCompact ? 'text-sm' : ''}`}>
          Data Access Permissions
        </h4>
        <div className="space-y-2">
          {permissions.map((permission) => (
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
                  <Badge
                    variant={getPermissionBadgeVariant(permission.isDeclared, permission.isDetected)}
                  >
                    {permission.isDeclared && permission.isDetected && 'Declared & Detected'}
                    {permission.isDeclared && !permission.isDetected && 'Declared Only'}
                    {!permission.isDeclared && permission.isDetected && 'Detected Only'}
                  </Badge>
                </div>
                <p className={`text-muted-foreground ${isCompact ? 'text-xs' : 'text-xs'}`}>
                  {permission.description}
                </p>
                {permission.functions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {permission.functions.map((func: string) => (
                      <Badge 
                        key={func} 
                        variant="secondary" 
                        className={isCompact ? 'text-xs' : 'text-xs'}
                      >
                        {func}
                      </Badge>
                    ))}
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
