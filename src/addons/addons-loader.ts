import { logger } from '@/adapters';
import { loadInstalledAddons, unloadAllAddons } from '@/addons/addons-core';

/**
 * Loads all discovered addons with development mode support
 */
export async function loadAllAddons(): Promise<void> {
  
  try {
    // Check if we're in development mode and have dev servers
    if (import.meta.env.DEV) {
      logger.info('🔧 Development mode detected, checking for dev servers...');
      
      // Dynamic import for development mode
      const { addonDevManager } = await import('./addons-dev-mode');
      
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
 * Reloads all addons (useful for development)
 */
export async function reloadAllAddons(): Promise<void> {
  unloadAllAddons();
  await loadAllAddons();
}

// Re-export functions from core for backward compatibility
export { unloadAllAddons, getLoadedAddons, debugAddonState } from '@/addons/addons-core';
