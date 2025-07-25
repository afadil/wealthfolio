import { PERMISSION_CATEGORIES, type PermissionCategory, type AddonManifest, type AddonMetadata } from '@wealthfolio/addon-sdk';
import { invoke } from '@tauri-apps/api/core';

// Extract detected permissions from addon metadata using the unified permission system
export function getDetectedPermissionsFromMetadata(metadata: AddonMetadata): {
  detectedFunctions: string[];
  categories: PermissionCategory[];
  riskLevel: 'low' | 'medium' | 'high';
  declaredFunctions: string[];
  undeclaredFunctions: string[];
} | null {
  if (!metadata.permissions || metadata.permissions.length === 0) {
    return null;
  }

  const detectedFunctions: string[] = [];
  const declaredFunctions: string[] = [];
  const undeclaredFunctions: string[] = [];
  const usedCategoryIds = new Set<string>();

  // Process all permissions to separate detected vs declared
  for (const permission of metadata.permissions) {
    usedCategoryIds.add(permission.category);
    
    if (permission.is_detected) {
      detectedFunctions.push(...permission.functions);
    }
    
    if (permission.is_declared) {
      declaredFunctions.push(...permission.functions);
    }
    
    // Functions that are detected but not declared
    if (permission.is_detected && !permission.is_declared) {
      undeclaredFunctions.push(...permission.functions);
    }
  }

  // Map category IDs to full category objects
  const usedCategories = PERMISSION_CATEGORIES.filter(category =>
    usedCategoryIds.has(category.id)
  );

  // Determine overall risk level based on categories
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (usedCategories.some(cat => cat.riskLevel === 'high')) {
    riskLevel = 'high';
  } else if (usedCategories.some(cat => cat.riskLevel === 'medium')) {
    riskLevel = 'medium';
  }

  return {
    detectedFunctions: [...new Set(detectedFunctions)], // Remove duplicates
    categories: usedCategories,
    riskLevel,
    declaredFunctions: [...new Set(declaredFunctions)],
    undeclaredFunctions: [...new Set(undeclaredFunctions)]
  };
}

// Re-analyze addon permissions and update cache (only for legacy addons or manual refresh)
export async function redetectAddonPermissions(addonId: string): Promise<{
  detectedFunctions: string[];
  categories: PermissionCategory[];
  riskLevel: 'low' | 'medium' | 'high';
  declaredFunctions: string[];
  undeclaredFunctions: string[];
}> {
  console.warn('redetectAddonPermissions: This should only be used for legacy addons or manual refresh');
  
  try {
    // Get merged permissions from the redetect command
    const permissions = await invoke<any[]>('redetect_addon_permissions', {
      addonId
    });

    const detectedFunctions: string[] = [];
    const declaredFunctions: string[] = [];
    const undeclaredFunctions: string[] = [];
    const usedCategoryIds = new Set<string>();

    // Process permissions to extract detected/declared info
    for (const permission of permissions) {
      usedCategoryIds.add(permission.category);
      
      if (permission.is_detected) {
        detectedFunctions.push(...permission.functions);
      }
      
      if (permission.is_declared) {
        declaredFunctions.push(...permission.functions);
      }
      
      if (permission.is_detected && !permission.is_declared) {
        undeclaredFunctions.push(...permission.functions);
      }
    }

    // Map category IDs to full category objects
    const usedCategories = PERMISSION_CATEGORIES.filter(category =>
      usedCategoryIds.has(category.id)
    );

    // Determine overall risk level
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (usedCategories.some(cat => cat.riskLevel === 'high')) {
      riskLevel = 'high';
    } else if (usedCategories.some(cat => cat.riskLevel === 'medium')) {
      riskLevel = 'medium';
    }

    return {
      detectedFunctions: [...new Set(detectedFunctions)],
      categories: usedCategories,
      riskLevel,
      declaredFunctions: [...new Set(declaredFunctions)],
      undeclaredFunctions: [...new Set(undeclaredFunctions)]
    };
  } catch (error) {
    console.error('Failed to redetect permissions:', error);
    throw error;
  }
}

// Legacy function: Heavy permission analysis (use only for non-installed addons or preview)
export function analyzeAddonPermissions(addonCode: string): {
  detectedFunctions: string[];
  categories: PermissionCategory[];
  riskLevel: 'low' | 'medium' | 'high';
} {
  console.warn('analyzeAddonPermissions: Using heavy runtime analysis. This should only be used for addon preview before installation.');
  
  const detectedFunctions: string[] = [];
  
  // Search for API function calls in the code
  PERMISSION_CATEGORIES.forEach(category => {
    category.functions.forEach(func => {
      // Look for various patterns of function calls
      const patterns = [
        new RegExp(`\\.${func}\\s*\\(`, 'g'), // object.function()
        new RegExp(`\\b${func}\\s*\\(`, 'g'),  // function()
        new RegExp(`["']${func}["']`, 'g'),    // "function" as string
      ];
      
      patterns.forEach(pattern => {
        if (pattern.test(addonCode)) {
          if (!detectedFunctions.includes(func)) {
            detectedFunctions.push(func);
          }
        }
      });
    });
  });
  
  // Find categories that have detected functions
  const usedCategories = PERMISSION_CATEGORIES.filter(category =>
    category.functions.some(func => detectedFunctions.includes(func))
  );
  
  // Determine overall risk level
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (usedCategories.some(cat => cat.riskLevel === 'high')) {
    riskLevel = 'high';
  } else if (usedCategories.some(cat => cat.riskLevel === 'medium')) {
    riskLevel = 'medium';
  }
  
  return {
    detectedFunctions,
    categories: usedCategories,
    riskLevel
  };
}

export function validateManifestPermissions(
  manifest: AddonManifest,
  detectedFunctions: string[]
): {
  isValid: boolean;
  missingPermissions: string[];
  extraPermissions: string[];
} {
  const declaredFunctions = manifest.permissions?.flatMap(permission => permission.functions) || [];
  
  const missingPermissions = detectedFunctions.filter(
    func => !declaredFunctions.includes(func)
  );
  
  const extraPermissions = declaredFunctions.filter(
    func => !detectedFunctions.includes(func)
  );
  
  return {
    isValid: missingPermissions.length === 0,
    missingPermissions,
    extraPermissions
  };
}

export function formatPermissionDescription(categories: PermissionCategory[]): string {
  if (categories.length === 0) {
    return 'This addon will have minimal access to your data.';
  }
  
  const descriptions = categories.map(cat => cat.name).join(', ');
  return `This addon will access: ${descriptions}`;
}

// Re-export for compatibility
export { PERMISSION_CATEGORIES, type PermissionCategory, type AddonManifest };
