import { useEffect, useState } from 'react';
import { loadAllAddons } from '../addon/pluginLoader';

export function useAddonStartup() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedAddonsCount, setLoadedAddonsCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    const loadStartupAddons = async () => {
      try {
        console.log('🔌 Loading addons on startup...');
        
        // Use the main loader which discovers and loads all enabled addons
        await loadAllAddons();
        
        if (!mounted) return;

        console.log('🎉 Addons loaded successfully on startup');
        
      } catch (error) {
        console.error('❌ Error during addon startup loading:', error);
        if (mounted) {
          setError(error instanceof Error ? error.message : 'Failed to load startup addons');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadStartupAddons();

    return () => {
      mounted = false;
    };
  }, []);

  return {
    isLoading,
    error,
    loadedAddonsCount,
  };
} 