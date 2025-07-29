import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { checkAddonUpdate, checkAllAddonUpdates } from '@/commands/addon';
import type { AddonUpdateCheckResult } from '@wealthfolio/addon-sdk';

export function useAddonUpdates() {
  const [updateResults, setUpdateResults] = useState<AddonUpdateCheckResult[]>([]);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [lastUpdateCheck, setLastUpdateCheck] = useState<Date | null>(null);
  const { toast } = useToast();

  const checkSingleAddonUpdate = useCallback(async (addonId: string) => {
    try {
      const result = await checkAddonUpdate(addonId);
      
      // Update the results array
      setUpdateResults(prev => {
        const existing = prev.findIndex(r => r.addonId === addonId);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = result;
          return updated;
        } else {
          return [...prev, result];
        }
      });
      
      return result;
    } catch (error) {
      console.error(`Error checking update for addon ${addonId}:`, error);
      toast({
        title: 'Update check failed',
        description: `Failed to check updates for addon ${addonId}`,
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast]);

  const checkAllUpdates = useCallback(async () => {
    try {
      setIsCheckingUpdates(true);
      const results = await checkAllAddonUpdates();
      setUpdateResults(results);
      setLastUpdateCheck(new Date());
      
      // Show notification if updates are available
      const hasUpdates = results.some(r => r.updateInfo.updateAvailable);
      const criticalUpdates = results.filter(r => r.updateInfo.updateAvailable && r.updateInfo.isCritical);
      
      if (criticalUpdates.length > 0) {
        toast({
          title: '🚨 Critical updates available',
          description: `${criticalUpdates.length} addon${criticalUpdates.length > 1 ? 's have' : ' has'} critical security updates available.`,
          variant: 'destructive',
        });
      } else if (hasUpdates) {
        const updateCount = results.filter(r => r.updateInfo.updateAvailable).length;
        toast({
          title: '📦 Updates available',
          description: `${updateCount} addon${updateCount > 1 ? 's have' : ' has'} updates available.`,
        });
      }
      
      return results;
    } catch (error) {
      console.error('Error checking all addon updates:', error);
      toast({
        title: 'Update check failed',
        description: 'Failed to check for addon updates. Please try again later.',
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsCheckingUpdates(false);
    }
  }, [toast]);

  const getUpdateResult = useCallback((addonId: string) => {
    return updateResults.find(r => r.addonId === addonId);
  }, [updateResults]);

  const hasUpdates = useCallback(() => {
    return updateResults.some(r => r.updateInfo.updateAvailable);
  }, [updateResults]);

  const getUpdateCount = useCallback(() => {
    return updateResults.filter(r => r.updateInfo.updateAvailable).length;
  }, [updateResults]);

  const getCriticalUpdateCount = useCallback(() => {
    return updateResults.filter(r => r.updateInfo.updateAvailable && r.updateInfo.isCritical).length;
  }, [updateResults]);

  const clearUpdateResult = useCallback((addonId: string) => {
    setUpdateResults(prev => prev.filter(r => r.addonId !== addonId));
  }, []);

  const clearAllUpdateResults = useCallback(() => {
    setUpdateResults([]);
  }, []);

  return {
    // State
    updateResults,
    isCheckingUpdates,
    lastUpdateCheck,
    
    // Actions
    checkSingleAddonUpdate,
    checkAllUpdates,
    clearUpdateResult,
    clearAllUpdateResults,
    
    // Computed values
    getUpdateResult,
    hasUpdates,
    getUpdateCount,
    getCriticalUpdateCount,
  };
}
