import type { AddonContext, AddonManifest } from '@wealthfolio/addon-sdk';
import { ReactVersion } from '@wealthfolio/addon-sdk';
import { createAddonContext, getDynamicNavItems, getDynamicRoutes, triggerAllDisableCallbacks } from '@/addons/addons-runtime-context';
import { logger } from '@/adapters';
import { getInstalledAddons, loadAddon as loadAddonRuntime } from '@/commands/addon';

interface AddonFile {
  path: string;
  manifestPath: string;
  manifest: AddonManifest;
}

// Store loaded addons for cleanup
const loadedAddons = new Map<string, { disable?: () => void }>();
const loadedAddonIds = new Set<string>(); // Prevent re-loading already processed addons

/**
 * Discovers all available addons using Tauri commands
 */
async function discoverAddons(): Promise<AddonFile[]> {
  try {
    const installedAddons = await getInstalledAddons();
    const addonFiles: AddonFile[] = [];

    for (const addon of installedAddons) {
      // Create AddonFile structure from InstalledAddon
      // Note: filePath from Tauri represents the addon directory, not the specific file
      addonFiles.push({
        path: `${addon.filePath}/${addon.metadata.main}`, // Construct the main file path
        manifestPath: `${addon.filePath}/manifest.json`, // Construct manifest path
        manifest: addon.metadata
      });
    }

    return addonFiles;
  } catch (error) {
    logger.error(`Failed to discover addons: ${String(error)}`);
    return [];
  }
}

/**
 * Validates if an addon is compatible with the current SDK version
 */
function validateAddonCompatibility(manifest: AddonManifest): boolean {
  // Be lenient in web mode: warn on mismatch but allow load.
  // Future: implement proper semver compatibility if needed.
  if (manifest.sdkVersion && manifest.sdkVersion !== '1.0.0') {
    logger.warn(`Addon ${manifest.id} declares SDK ${manifest.sdkVersion}; host is 1.0.0. Proceeding with caution.`);
  }
  return true;
}

/**
 * Loads a single addon using Tauri commands
 */
async function loadAddon(addonFile: AddonFile, _context: AddonContext): Promise<boolean> {
  let blobUrl: string | null = null;
  try {
    // Check if this addon ID has already been loaded in the current session
    if (loadedAddonIds.has(addonFile.manifest.id)) {
      logger.warn(`Addon "${addonFile.manifest.name}" (ID: ${addonFile.manifest.id}) already loaded in this session. Skipping duplicate load.`);
      // Optionally, you might want to return true if already loaded implies success for the caller
      return true; 
    }

    // Validate compatibility
    if (!validateAddonCompatibility(addonFile.manifest)) {
      logger.error(`Addon ${addonFile.manifest.id} is not compatible`);
      return false;
    }

    // Load addon using Tauri command instead of direct file access
        // Load addon for runtime execution using Tauri command
    const extractedAddon = await loadAddonRuntime(addonFile.manifest.id);
    
    // Find the main file from the extracted addon files
    const mainFile = extractedAddon.files.find(file => file.isMain);
    if (!mainFile) {
      logger.error(`Main file not found for addon ${addonFile.manifest.id}. Available files: ${extractedAddon.files.map(f => f.name).join(', ')}`);
      return false;
    }

    const addonCode = mainFile.content;

    // Extract permission data directly from manifest (already processed by Rust backend)
    const permissions = extractedAddon.metadata.permissions || [];
    const detectedFunctions = permissions.flatMap(p => 
      p.functions.filter((f: any) => f.isDetected).map((f: any) => f.name)
    );
    const detectedCategories = [...new Set(permissions.map(p => p.category))];
    
    logger.info(`Permissions for addon ${extractedAddon.metadata.id}: functions=[${detectedFunctions.join(',')}], categories=[${detectedCategories.join(',')}]`);
    
    // Runtime guards: Verify React singletons are available before addon execution
    if ((globalThis as any).React?.version && (globalThis as any).React.version !== ReactVersion) {
      logger.warn(`⚠️ React version mismatch: host=${(globalThis as any).React.version} sdk=${ReactVersion}`);
    }

    if (typeof (globalThis as any).ReactDOM?.createPortal !== 'function') {
      throw new Error('Host did not expose ReactDOM.createPortal. Portal-based UI components will not work.');
    }

    // Create a Blob and an object URL
    const blob = new Blob([addonCode], { type: 'text/javascript' });
    blobUrl = URL.createObjectURL(blob);

    // Dynamic import using the Blob URL
    // The /* @vite-ignore */ comment might not be strictly necessary for blob URLs 
    // but can be kept if vite shows warnings during build.
    const mod = await import(/* @vite-ignore */ blobUrl);
    
    
    // Robustly resolve the addon's enable() regardless of bundle style
    let enableFunction: any =
      // 1. ES‑module default export IS the enable function
      (typeof mod.default === 'function' && mod.default) ||

      // 2. ES‑module default export is an object exposing enable
      (mod.default && typeof mod.default.enable === 'function' && mod.default.enable) ||

      // 3. Named (or CommonJS) export called enable
      (typeof mod.enable === 'function' && mod.enable) ||

      // 4. UMD/global where the constructor's name matches addon name
      (typeof mod.PortfolioTrackerAddon === 'function' && mod.PortfolioTrackerAddon) ||

      // 5. Module itself is callable
      (typeof mod === 'function' && mod) ||

      null;

    if (!enableFunction) {
      logger.error(`❌ Addon ${extractedAddon.metadata.id} does not export a valid enable function. Available exports: ${Object.keys(mod).join(', ')}`);
      return false;
    }

    // Create addon-specific context with scoped secrets
    const addonSpecificContext = createAddonContext(extractedAddon.metadata.id);
    const result = await enableFunction(addonSpecificContext);
    
    // Store addon reference for potential cleanup
    loadedAddons.set(extractedAddon.metadata.id, {
      disable: typeof result?.disable === 'function' ? result.disable : undefined
    });
    loadedAddonIds.add(extractedAddon.metadata.id); // Add to set after successful load and enablement

    return true;
  } catch (error) {
    logger.error(`Failed to load addon ${addonFile.manifest.id}: ${String(error)}`);
    return false;
  } finally {
    // Clean up the Blob URL
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
  }
}

/**
 * Load installed addons (production mode)
 */
export async function loadInstalledAddons(): Promise<void> {
  const addonFiles = await discoverAddons();

  if (addonFiles.length === 0) {
    logger.info('⚠️  No addons found to load - check AppData/addons directory');
    return;
  }

  // Filter only enabled addons
  const enabledAddonFiles = addonFiles.filter(addonFile => addonFile.manifest.enabled !== false);

  if (enabledAddonFiles.length === 0) {
    logger.info('📦 No enabled addons found to load');
    return;
  }

  let loadedCount = 0;
  const loadPromises = enabledAddonFiles.map(async (addonFile) => {
    // Each addon gets its own context, but loadAddon creates its own internally
    const success = await loadAddon(addonFile, {} as AddonContext);
    if (success) {
      loadedCount++;
    } else {
    }
  });

  // Load all enabled addons concurrently
  await Promise.all(loadPromises);
  
  logger.info(`🎉 Successfully loaded ${loadedCount} out of ${enabledAddonFiles.length} enabled addons`);
  
  // Debug: Show current navigation state
}

/**
 * Unloads a specific addon by ID
 */
export function unloadAddon(addonId: string): void {
  const addon = loadedAddons.get(addonId);
  if (addon) {
    try {
      if (addon.disable) {
        addon.disable();
      }
      loadedAddons.delete(addonId);
      loadedAddonIds.delete(addonId);
      logger.info(`🗑️ Unloaded addon: ${addonId}`);
    } catch (error) {
      logger.error(`Error unloading addon ${addonId}: ${String(error)}`);
    }
  }
}

/**
 * Unloads all addons and cleans up resources
 */
export function unloadAllAddons(): void {
  
  loadedAddons.forEach((addon, id) => {
    try {
      if (addon.disable) {
        addon.disable();
      }
    } catch (error) {
      logger.error(`Error unloading addon ${id}: ${String(error)}`);
    }
  });
  
  loadedAddons.clear();
  loadedAddonIds.clear(); // Clear the set when unloading all
  
  // Clear navigation items and routes from runtime context
  triggerAllDisableCallbacks();
}

/**
 * Gets information about currently loaded addons
 */
export function getLoadedAddons(): string[] {
  return Array.from(loadedAddons.keys());
}

/**
 * Debug function to check current addon state
 */
export function debugAddonState(): void {
  logger.info('🐛 Addon Debug Info:');
  logger.info(`- Dynamic nav items: ${JSON.stringify(getDynamicNavItems())}`);
  logger.info(`- Dynamic routes: ${JSON.stringify(getDynamicRoutes())}`);
  logger.info(`- Loaded addons: ${JSON.stringify(getLoadedAddons())}`);
}

/**
 * Reloads all addons (useful for development and settings)
 * This function dynamically imports the full plugin loader to avoid circular dependencies
 */
export async function reloadAllAddons(): Promise<void> {
  unloadAllAddons();
  
  // Dynamically import the full plugin loader to avoid importing dev mode
  const { loadAllAddons } = await import('./addons-loader');
  await loadAllAddons();
}
