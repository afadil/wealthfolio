import { readDir, readTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import type { AddonContext } from '@wealthfolio/addon-sdk';
import realCtx, { getDynamicNavItems, getDynamicRoutes } from './runtimeContext';

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

/**
 * Discovers all available addons in the AppData/addons directory
 */
async function discoverAddons(): Promise<AddonFile[]> {
  try {
    console.log('🔍 Reading addons directory...');
    const addonDirs = await readDir('addons', { baseDir: BaseDirectory.AppData });
    console.log('📂 Raw addon directories found:', addonDirs);
    
    const addonFiles: AddonFile[] = [];

    for (const dir of addonDirs as any[]) {
      console.log(`🔍 Checking directory: ${dir.name}`, dir);
      
      // Skip non-directories (like .DS_Store)
      if (!dir.isDirectory || !dir.name) {
        console.log(`⚠️ Skipping ${dir.name} - not a directory`);
        continue;
      }

      try {
        // Read the contents of this addon directory
        console.log(`📁 Reading contents of addon directory: ${dir.name}`);
        const addonDirContents = await readDir(`addons/${dir.name}`, { baseDir: BaseDirectory.AppData });
        console.log(`📁 Directory ${dir.name} contents:`, addonDirContents.map((f: any) => f.name));

        // Look for manifest.json first
        const manifestJson = addonDirContents.find((file: any) => file.name === 'manifest.json');

        if (manifestJson) {
          try {
            // Read manifest.json using Tauri file system API
            const manifestPath = `addons/${dir.name}/manifest.json`;
            console.log(`📄 Reading manifest from path: ${manifestPath}`);
            
            // Read and parse manifest using readTextFile
            const manifestContent = await readTextFile(manifestPath, { baseDir: BaseDirectory.AppData });
            console.log(`📄 Manifest content:`, manifestContent);
            
            const manifest: AddonManifest = JSON.parse(manifestContent);
            console.log(`📋 Parsed manifest:`, manifest);

            // Get the main file path from manifest (default to 'addon.js')
            const mainFile = manifest.main || 'addon.js';
            console.log(`🎯 Looking for main file: ${mainFile}`);
            
            // Find the actual addon file based on the main field
            const addonJs = addonDirContents.find((file: any) => {
              console.log(`🔍 Checking file: ${file.name} vs ${mainFile}`);
              // Support both relative path and just filename
              return file.name === mainFile;
            });

            // If not found directly, check if it's in a subdirectory (like dist/)
            if (!addonJs && mainFile.includes('/')) {
              console.log(`🔍 Main file contains path separator, looking for subdirectory...`);
              const [subDir, fileName] = mainFile.split('/');
              console.log(`🔍 Looking for subdirectory: ${subDir}, file: ${fileName}`);
              
              // Check if subdirectory exists
              const subDirectory = addonDirContents.find((item: any) => item.name === subDir && item.isDirectory);
              if (subDirectory) {
                console.log(`📁 Found subdirectory ${subDir}, reading its contents...`);
                try {
                  const subDirContents = await readDir(`addons/${dir.name}/${subDir}`, { baseDir: BaseDirectory.AppData });
                  console.log(`📁 Subdirectory ${subDir} contents:`, subDirContents.map((f: any) => f.name));
                  
                  const addonJsInSubDir = subDirContents.find((file: any) => file.name === fileName);
                  if (addonJsInSubDir) {
                    // Construct the full path for the addon file in subdirectory
                    const addonPath = `addons/${dir.name}/${subDir}/${fileName}`;
                    console.log(`✅ Found addon file in subdirectory: ${addonPath}`);
                    addonFiles.push({
                      path: addonPath,
                      manifestPath: manifestPath,
                      manifest
                    });
                    continue;
                  }
                } catch (subDirError) {
                  console.error(`Failed to read subdirectory ${subDir}:`, subDirError);
                }
              }
            }

            if (addonJs) {
              // Construct the full path for the addon file
              const addonPath = `addons/${dir.name}/${addonJs.name}`;
              console.log(`✅ Found addon file: ${addonPath}`);
              addonFiles.push({
                path: addonPath,
                manifestPath: manifestPath,
                manifest
              });
            } else {
              console.warn(`❌ Main file '${mainFile}' not found for addon ${manifest.id}`);
              console.log(`Available files:`, addonDirContents.map((f: any) => ({ name: f.name, isDirectory: f.isDirectory })));
            }
          } catch (error) {
            console.error(`Failed to read manifest for addon in ${dir.name}:`, error);
          }
        } else {
          console.log(`❌ No manifest.json found in ${dir.name}`);
        }
      } catch (dirError) {
        console.error(`Failed to read directory contents for ${dir.name}:`, dirError);
      }
    }

    console.log(`🎉 Discovery complete: found ${addonFiles.length} valid addons`);
    return addonFiles;
  } catch (error) {
    console.error('Failed to discover addons:', error);
    return [];
  }
}

/**
 * Validates if an addon is compatible with the current SDK version
 */
function validateAddonCompatibility(manifest: AddonManifest): boolean {
  // Simple version check - you might want to implement semver compatibility
  if (manifest.sdkVersion && manifest.sdkVersion !== '1.0.0') {
    console.warn(`Addon ${manifest.id} requires SDK version ${manifest.sdkVersion}, current is 1.0.0`);
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
    console.log(`Loading addon: ${addonFile.manifest.name} (${addonFile.manifest.id})`);
    console.log(`Addon file relative path (from AppData): ${addonFile.path}`);

    // Validate compatibility
    if (!validateAddonCompatibility(addonFile.manifest)) {
      console.error(`Addon ${addonFile.manifest.id} is not compatible`);
      return false;
    }

    // Read the addon's JavaScript file content
    // addonFile.path is relative to AppData, e.g., "addons/addon-id/dist/addon.js"
    console.log(`Reading addon file content from: ${addonFile.path}`);
    const addonCode = await readTextFile(addonFile.path, { baseDir: BaseDirectory.AppData });
    console.log(`Addon code read successfully (length: ${addonCode.length})`);

    // Create a Blob and an object URL
    const blob = new Blob([addonCode], { type: 'text/javascript' });
    blobUrl = URL.createObjectURL(blob);
    console.log(`Generated Blob URL for dynamic import: ${blobUrl}`);
    
    // Dynamic import using the Blob URL
    // The /* @vite-ignore */ comment might not be strictly necessary for blob URLs 
    // but can be kept if vite shows warnings during build.
    const mod = await import(/* @vite-ignore */ blobUrl);
    
    console.log('🔍 Module object:', mod);
    console.log('🔍 Module keys:', Object.keys(mod));
    
    // Robustly resolve the addon’s enable() regardless of bundle style
    let enableFunction: any =
      // 1. ES‑module default export IS the enable function
      (typeof mod.default === 'function' && mod.default) ||

      // 2. ES‑module default export is an object exposing enable
      (mod.default && typeof mod.default.enable === 'function' && mod.default.enable) ||

      // 3. Named (or CommonJS) export called enable
      (typeof mod.enable === 'function' && mod.enable) ||

      // 4. UMD/global where the constructor’s name matches addon name
      (typeof mod.PortfolioTrackerAddon === 'function' && mod.PortfolioTrackerAddon) ||

      // 5. Module itself is callable
      (typeof mod === 'function' && mod) ||

      null;

    if (!enableFunction) {
      console.error(`❌ Addon ${addonFile.manifest.id} does not export a valid enable function`);
      console.error('Available exports:', Object.keys(mod));
      return false;
    }

    console.log('✅ Resolved enable() for', addonFile.manifest.id);

    const result = await enableFunction(context);
    
    // Store addon reference for potential cleanup
    loadedAddons.set(addonFile.manifest.id, {
      disable: typeof result?.disable === 'function' ? result.disable : undefined
    });

    console.log(`Successfully loaded addon: ${addonFile.manifest.name}`);
    return true;
  } catch (error) {
    console.error(`Failed to load addon ${addonFile.manifest.id}:`, error);
    return false;
  } finally {
    // Clean up the Blob URL
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      console.log(`Revoked Blob URL: ${blobUrl}`);
    }
  }
}

/**
 * Loads all discovered addons
 */
export async function loadAllAddons(): Promise<void> {
  console.log('🔍 Starting addon discovery and loading...');
  
  try {
    const addonFiles = await discoverAddons();
    console.log(`📦 Discovered ${addonFiles.length} addon(s):`, addonFiles.map(f => f.manifest.name));

    if (addonFiles.length === 0) {
      console.log('⚠️  No addons found to load - check AppData/addons directory');
      return;
    }

    let loadedCount = 0;
    const loadPromises = addonFiles.map(async (addonFile) => {
      console.log(`🔧 Attempting to load addon: ${addonFile.manifest.name}`);
      const success = await loadAddon(addonFile, realCtx);
      if (success) {
        loadedCount++;
        console.log(`✅ Successfully loaded: ${addonFile.manifest.name}`);
      } else {
        console.log(`❌ Failed to load: ${addonFile.manifest.name}`);
      }
    });

    // Load all addons concurrently
    await Promise.all(loadPromises);
    
    console.log(`🎉 Loading complete: ${loadedCount}/${addonFiles.length} addon(s) loaded successfully`);
    
    // Debug: Show current navigation state
    console.log('🧐 Debug - Current dynamic nav items:', realCtx);
  } catch (error) {
    console.error('❌ Failed to load addons:', error);
  }
}

/**
 * Unloads all addons and cleans up resources
 */
export function unloadAllAddons(): void {
  console.log('Unloading all addons...');
  
  loadedAddons.forEach((addon, id) => {
    try {
      if (addon.disable) {
        addon.disable();
      }
      console.log(`Unloaded addon: ${id}`);
    } catch (error) {
      console.error(`Error unloading addon ${id}:`, error);
    }
  });
  
  loadedAddons.clear();
  console.log('All addons unloaded');
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
  console.log('Reloading all addons...');
  unloadAllAddons();
  await loadAllAddons();
}

/**
 * Debug function to check current addon state
 */
export function debugAddonState(): void {
  console.log('🐛 Addon Debug Info:');
  console.log('- Dynamic nav items:', getDynamicNavItems());
  console.log('- Dynamic routes:', getDynamicRoutes());
  console.log('- Loaded addons:', getLoadedAddons());
}
