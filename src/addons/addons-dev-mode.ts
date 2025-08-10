import { logger } from '@/adapters';
import { reloadAllAddons } from '@/addons/addons-core';
import { createAddonContext } from './addons-runtime-context';

interface DevModeConfig {
  enabled: boolean;
  watchPaths: string[];
  pollInterval: number;
  autoReload: boolean;
}

interface AddonDevServer {
  id: string;
  name: string;
  url: string;
  port: number;
  status: 'running' | 'stopped' | 'error';
  lastUpdated?: Date;
}

class AddonDevManager {
  private config: DevModeConfig;
  private devServers: Map<string, AddonDevServer> = new Map();
  private watchInterval: number | null = null;
  private eventSource: EventSource | null = null;

  constructor() {
    this.config = {
      enabled: import.meta.env.DEV || false,
      watchPaths: [],
      pollInterval: 1000,
      autoReload: true,
    };
    
    // Note: Auto-discovery is now done lazily when enableDevMode() is called
    // This prevents side effects during module import
  }

  /**
   * Auto-discover running development servers
   */
  private async discoverDevServers(): Promise<void> {
    const commonPorts = [3001, 3002, 3003, 3004, 3005];
    
    logger.info('🔍 Auto-discovering addon development servers...');
    
    for (const port of commonPorts) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        
        const response = await fetch(`http://localhost:${port}/health`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          // Try to get manifest to identify the addon
          try {
            const manifestResponse = await fetch(`http://localhost:${port}/manifest.json`);
            if (manifestResponse.ok) {
              const manifest = await manifestResponse.json();
              
              this.registerDevServer({
                id: manifest.id,
                name: manifest.name,
                port: port
              });
              
              logger.info(`✅ Discovered dev server: ${manifest.name} on port ${port}`);
            }
          } catch (manifestError) {
            // No manifest, might not be an addon server
          }
        }
      } catch (error) {
        // Server not running on this port, continue
      }
    }
  }

  /**
   * Enable development mode with hot reloading
   */
  async enableDevMode(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('🔧 Enabling addon development mode...');
      this.config.enabled = true;
    }
    
    // Always re-discover servers when explicitly enabling
    await this.discoverDevServers();
    
    // Start file watching
    this.startWatching();
    
    // Setup hot reload endpoint
    this.setupHotReloadServer();
    
    // Add dev tools to context
    this.injectDevTools();
    
    logger.info('✅ Addon development mode enabled');
  }

  /**
   * Disable development mode
   */
  disableDevMode(): void {
    if (this.config.enabled) {
      logger.info('🔧 Disabling addon development mode...');
      this.config.enabled = false;
      
      this.stopWatching();
      this.cleanup();
      
      logger.info('✅ Addon development mode disabled');
    }
  }

  /**
   * Register a development server for an addon
   */
  registerDevServer(addon: {
    id: string;
    name: string;
    port: number;
  }): void {
    const devServer: AddonDevServer = {
      id: addon.id,
      name: addon.name,
      url: `http://localhost:${addon.port}`,
      port: addon.port,
      status: 'stopped',
    };
    
    this.devServers.set(addon.id, devServer);
    logger.info(`📝 Registered dev server for ${addon.name} at port ${addon.port}`);
  }

  /**
   * Load addon from development server
   */
  async loadAddonFromDevServer(addonId: string): Promise<boolean> {
    const devServer = this.devServers.get(addonId);
    if (!devServer) {
      logger.error(`No dev server registered for addon: ${addonId}`);
      return false;
    }

    try {
      // Check if dev server is running
      const response = await fetch(`${devServer.url}/health`);
      if (!response.ok) {
        throw new Error(`Dev server not responding: ${response.status}`);
      }

      // Load addon code from dev server
      const addonResponse = await fetch(`${devServer.url}/addon.js`);
      if (!addonResponse.ok) {
        throw new Error(`Failed to load addon code: ${addonResponse.status}`);
      }

      const addonCode = await addonResponse.text();
      
      // Load manifest
      const manifestResponse = await fetch(`${devServer.url}/manifest.json`);
      const manifest = manifestResponse.ok ? await manifestResponse.json() : null;

      // Execute addon code in development context
      await this.executeAddonCode(addonCode, manifest, addonId);
      
      devServer.status = 'running';
      devServer.lastUpdated = new Date();
      
      logger.info(`🚀 Loaded addon ${devServer.name} from dev server`);
      return true;
    } catch (error) {
      devServer.status = 'error';
      logger.error(`❌ Failed to load addon from dev server: ${error}`);
      return false;
    }
  }

  /**
   * Execute addon code in a sandboxed environment
   */
  private async executeAddonCode(
    code: string, 
    _manifest: any, 
    addonId: string
  ): Promise<void> {
    try {
      // Runtime guard: Verify React singletons are available
      if (typeof (globalThis as any).ReactDOM?.createPortal !== 'function') {
        throw new Error('Host did not expose ReactDOM.createPortal. Portal-based UI components will not work.');
      }

      // Create a blob URL for the addon code
      const blob = new Blob([code], { type: 'text/javascript' });
      const blobUrl = URL.createObjectURL(blob);

      // Import and execute the addon
      const mod = await import(/* @vite-ignore */ blobUrl);
      
      if (typeof mod.default === 'function') {
        // Create addon-specific context with scoped secrets
        const addonSpecificContext = createAddonContext(addonId);
        const addonInstance = mod.default(addonSpecificContext);
        
        // Store for cleanup
        if (addonInstance && typeof addonInstance.disable === 'function') {
          (globalThis as any).__DEV_ADDONS__ = (globalThis as any).__DEV_ADDONS__ || new Map();
          (globalThis as any).__DEV_ADDONS__.set(addonId, addonInstance);
        }
      }

      // Cleanup blob URL
      URL.revokeObjectURL(blobUrl);
      
    } catch (error) {
      logger.error(`Failed to execute addon code for ${addonId}: ${error}`);
      throw error;
    }
  }

  /**
   * Start file watching for hot reload
   */
  private startWatching(): void {
    if (this.watchInterval) return;
    
    // Use polling for simplicity - could be enhanced with native file watchers
    this.watchInterval = window.setInterval(() => {
      this.checkForUpdates();
    }, this.config.pollInterval);
  }

  /**
   * Stop file watching
   */
  private stopWatching(): void {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
  }

  /**
   * Check for updates from dev servers
   */
  private async checkForUpdates(): Promise<void> {
    for (const [addonId, devServer] of this.devServers) {
      if (devServer.status !== 'running') continue;
      
      try {
        const response = await fetch(`${devServer.url}/status`);
        if (response.ok) {
          const status = await response.json();
          
          if (status.lastModified && devServer.lastUpdated) {
            const lastModified = new Date(status.lastModified);
            if (lastModified > devServer.lastUpdated) {
              logger.info(`🔄 Detected changes in ${devServer.name}, auto-reloading...`);
              await this.reloadAddon(addonId);
            }
          }
        }
      } catch (error) {
        // Silent fail for polling - dev server might be down
      }
    }
  }

  /**
   * Reload a specific addon
   */
  private async reloadAddon(addonId: string): Promise<void> {
    try {
      // Clean up existing instance
      const devAddons = (globalThis as any).__DEV_ADDONS__;
      if (devAddons && devAddons.has(addonId)) {
        const instance = devAddons.get(addonId);
        if (instance.disable) {
          logger.info(`🧹 Cleaning up old instance of ${addonId}`);
          instance.disable();
        }
        devAddons.delete(addonId);
      }

      // Also clean up from the main addon loader
      const { unloadAddon } = await import('./addons-core');
      if (unloadAddon) {
        unloadAddon(addonId);
      }

      // Small delay to ensure cleanup is complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Reload from dev server
      const success = await this.loadAddonFromDevServer(addonId);
      
      if (success) {
        logger.info(`✅ Successfully hot-reloaded ${addonId}`);
        
        // Trigger navigation update to refresh the UI
        const { triggerNavigationUpdate } = await import('./addons-runtime-context');
        if (triggerNavigationUpdate) {
          triggerNavigationUpdate();
        }
      } else {
        logger.error(`❌ Failed to reload ${addonId}`);
      }
    } catch (error) {
      logger.error(`❌ Error during hot reload of ${addonId}: ${error}`);
    }
  }

  /**
   * Setup hot reload server connection
   */
  private setupHotReloadServer(): void {
    // Connect to hot reload server if available
    if (typeof EventSource !== 'undefined') {
      try {
        this.eventSource = new EventSource('http://localhost:3001/addon-updates');
        
        this.eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'addon-changed' && data.addonId) {
            this.reloadAddon(data.addonId);
          }
        };

        this.eventSource.onerror = () => {
          // Hot reload server not available - that's fine
        };
      } catch (error) {
        // EventSource not available or failed
      }
    }
  }

  /**
   * Inject development tools into addon context
   */
  private injectDevTools(): void {
    // Add development-specific APIs to a generic context
    const devCtx = createAddonContext('dev-tools');
    (devCtx as any).dev = {
      reload: () => reloadAllAddons(),
      listServers: () => Array.from(this.devServers.values()),
      enableAutoReload: () => { this.config.autoReload = true; },
      disableAutoReload: () => { this.config.autoReload = false; },
    };
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    // Clean up dev addon instances
    const devAddons = (globalThis as any).__DEV_ADDONS__;
    if (devAddons) {
      for (const [, instance] of devAddons) {
        if (instance.disable) {
          instance.disable();
        }
      }
      devAddons.clear();
    }
  }

  /**
   * Manually discover and register development servers
   */
  async discoverAndRegister(): Promise<void> {
    await this.discoverDevServers();
  }

  /**
   * Get development status
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      servers: Array.from(this.devServers.values()),
      autoReload: this.config.autoReload,
    };
  }

  /**
   * Toggle development mode on/off
   */
  toggleDevMode(): boolean {
    if (this.config.enabled) {
      this.disableDevMode();
    } else {
      this.enableDevMode();
    }
    return this.config.enabled;
  }

  /**
   * Check if development mode is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Force disable development mode (for manual control)
   */
  forceDisable(): void {
    if (this.config.enabled) {
      logger.info('🔧 Force disabling addon development mode...');
      this.disableDevMode();
    }
  }

  /**
   * Force enable development mode (for manual control)
   */
  forceEnable(): void {
    if (!this.config.enabled && import.meta.env.DEV) {
      logger.info('🔧 Force enabling addon development mode...');
      this.enableDevMode();
    }
  }
}

// Global instance
export const addonDevManager = new AddonDevManager();

// Note: Development mode initialization is now done explicitly in main.tsx
// to avoid side effects during module imports

// Make debugging tools available globally in development mode
if (import.meta.env.DEV) {
  // Make available globally for debugging (dev only)
  (globalThis as any).__ADDON_DEV__ = addonDevManager;

  // Add global helper functions (dev only)
  (globalThis as any).discoverAddons = () => addonDevManager.discoverAndRegister();
  (globalThis as any).reloadAddons = () => reloadAllAddons();
}
