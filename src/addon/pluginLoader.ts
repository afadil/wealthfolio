import { readDir, readTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import type { AddonContext } from '@wealthfolio/addon-sdk';
// import realCtx, { getDynamicNavItems, getDynamicRoutes } from './runtimeContextBase';
import { realCtx, getDynamicNavItems, getDynamicRoutes } from '@/addon/runtimeContext';
import { logger } from '@/adapters/tauri';

interface AddonManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  sdkVersion?: string;
  main?: string;
}

interface AddonFile {
  path: string;
  manifestPath: string;
  manifest: AddonManifest;
}

// Store loaded addons for cleanup
const loadedAddons = new Map<string, { disable?: () => void }>();
const loadedAddonIds = new Set<string>(); // Prevent re-loading already processed addons

/**
 * Discovers all available addons in the AppData/addons directory
 */
async function discoverAddons(): Promise<AddonFile[]> {
  try {
    const addonDirs = await readDir('addons', { baseDir: BaseDirectory.AppData });
    
    const addonFiles: AddonFile[] = [];

    for (const dir of addonDirs as any[]) {
      
      // Skip non-directories (like .DS_Store)
      if (!dir.isDirectory || !dir.name) {
        continue;
      }

      try {
        // Read the contents of this addon directory
        const addonDirContents = await readDir(`addons/${dir.name}`, { baseDir: BaseDirectory.AppData });

        // Look for manifest.json first
        const manifestJson = addonDirContents.find((file: any) => file.name === 'manifest.json');

        if (manifestJson) {
          try {
            // Read manifest.json using Tauri file system API
            const manifestPath = `addons/${dir.name}/manifest.json`;
            
            // Read and parse manifest using readTextFile
            const manifestContent = await readTextFile(manifestPath, { baseDir: BaseDirectory.AppData });
            
            const manifest: AddonManifest = JSON.parse(manifestContent);

            // Get the main file path from manifest (default to 'addon.js')
            const mainFile = manifest.main || 'addon.js';
            
            // Find the actual addon file based on the main field
            const addonJs = addonDirContents.find((file: any) => {
              // Support both relative path and just filename
              return file.name === mainFile;
            });

            // If not found directly, check if it's in a subdirectory (like dist/)
            if (!addonJs && mainFile.includes('/')) {
              const [subDir, fileName] = mainFile.split('/');
              
              // Check if subdirectory exists
              const subDirectory = addonDirContents.find((item: any) => item.name === subDir && item.isDirectory);
              if (subDirectory) {
                try {
                  const subDirContents = await readDir(`addons/${dir.name}/${subDir}`, { baseDir: BaseDirectory.AppData });
                  
                  const addonJsInSubDir = subDirContents.find((file: any) => file.name === fileName);
                  if (addonJsInSubDir) {
                    // Construct the full path for the addon file in subdirectory
                    const addonPath = `addons/${dir.name}/${subDir}/${fileName}`;
                    addonFiles.push({
                      path: addonPath,
                      manifestPath: manifestPath,
                      manifest
                    });
                    continue;
                  }
                } catch (subDirError) {
                  logger.error(`Failed to read subdirectory ${subDir}: ${String(subDirError)}`);
                }
              }
            }

            if (addonJs) {
              // Construct the full path for the addon file
              const addonPath = `addons/${dir.name}/${addonJs.name}`;
              addonFiles.push({
                path: addonPath,
                manifestPath: manifestPath,
                manifest
              });
            } else {
              logger.warn(`Main file '${mainFile}' not found for addon ${manifest.id}`);
            }
          } catch (error) {
            logger.error(`Failed to read manifest for addon in ${dir.name}: ${String(error)}`);
          }
        } else {
        }
      } catch (dirError) {
        logger.error(`Failed to read directory contents for ${dir.name}: ${String(dirError)}`);
      }
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
 * Loads a single addon from its file path using Blob URLs
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

    // Read the addon's JavaScript file content
    // addonFile.path is relative to AppData, e.g., "addons/addon-id/dist/addon.js"
    const addonCode = await readTextFile(addonFile.path, { baseDir: BaseDirectory.AppData });

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
      logger.error(`❌ Addon ${addonFile.manifest.id} does not export a valid enable function. Available exports: ${Object.keys(mod).join(', ')}`);
      return false;
    }

    const result = await enableFunction(context);
    
    // Store addon reference for potential cleanup
    loadedAddons.set(addonFile.manifest.id, {
      disable: typeof result?.disable === 'function' ? result.disable : undefined
    });
    loadedAddonIds.add(addonFile.manifest.id); // Add to set after successful load and enablement

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
 * Loads all discovered addons
 */
export async function loadAllAddons(): Promise<void> {
  
  try {
    const addonFiles = await discoverAddons();

    if (addonFiles.length === 0) {
      logger.info('⚠️  No addons found to load - check AppData/addons directory');
      return;
    }

    let loadedCount = 0;
    const loadPromises = addonFiles.map(async (addonFile) => {
      const success = await loadAddon(addonFile, realCtx);
      if (success) {
        loadedCount++;
      } else {
      }
    });

    // Load all addons concurrently
    await Promise.all(loadPromises);
    
    
    // Debug: Show current navigation state
  } catch (error) {
    logger.error(`❌ Failed to load addons: ${String(error)}`);
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
