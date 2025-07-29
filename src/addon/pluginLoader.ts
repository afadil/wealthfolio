import type { AddonContext, AddonManifest } from '@wealthfolio/addon-sdk';
import { realCtx, getDynamicNavItems, getDynamicRoutes } from '@/addon/runtimeContext';
import { logger } from '@/adapters';
import { listInstalledAddons, loadAddonForRuntime } from '@/commands/addon';
import { addonDevManager } from './devMode';

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
    const installedAddons = await listInstalledAddons();
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
  // Simple version check - you might want to implement semver compatibility
  if (manifest.sdkVersion && manifest.sdkVersion !== '1.0.0') {
    logger.warn(`Addon ${manifest.id} requires SDK version ${manifest.sdkVersion}, current is 1.0.0`);
    return false;
  }
  return true;
}

/**
 * Loads a single addon using Tauri commands
 */
async function loadAddon(addonFile: AddonFile, context: AddonContext): Promise<boolean> {
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
    const extractedAddon = await loadAddonForRuntime(addonFile.manifest.id);
    
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

    const result = await enableFunction(context);
    
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
 * Loads all discovered addons with development mode support
 */
export async function loadAllAddons(): Promise<void> {
  
  try {
    // Check if we're in development mode and have dev servers
    if (import.meta.env.DEV) {
      logger.info('🔧 Development mode detected, checking for dev servers...');
      
      // Force discovery of dev servers
      await addonDevManager.enableDevMode();
      
      const devStatus = addonDevManager.getStatus();
      if (devStatus.enabled && devStatus.servers.length > 0) {
        logger.info(`� Found ${devStatus.servers.length} development server(s), loading addons...`);
        
        let devLoadedCount = 0;
        for (const server of devStatus.servers) {
          const success = await addonDevManager.loadAddonFromDevServer(server.id);
          if (success) {
            devLoadedCount++;
          }
        }
        
        logger.info(`✅ Loaded ${devLoadedCount} addon(s) from development servers`);
        
        // Also load installed addons that aren't in dev mode
        await loadInstalledAddons();
        return;
      } else {
        logger.info('🔍 No development servers found, falling back to installed addons');
      }
    }
    
    // Standard production loading
    await loadInstalledAddons();
    
  } catch (error) {
    logger.error(`❌ Failed to load addons: ${String(error)}`);
  }
}

/**
 * Load installed addons (production mode)
 */
async function loadInstalledAddons(): Promise<void> {
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
    const success = await loadAddon(addonFile, realCtx);
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
}

/**
 * Gets information about currently loaded addons
 */
export function getLoadedAddons(): string[] {
  return Array.from(loadedAddons.keys());
}

/**
 * Reloads all addons (useful for development)
 */
export async function reloadAllAddons(): Promise<void> {
  unloadAllAddons();
  await loadAllAddons();
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
 * Note: Addon permission analysis and file discovery is now handled by Tauri commands.
 * The addon loading process uses the Rust backend for secure file access and permission validation.
 */
