import type { Account, RebalancingStrategy } from './types';
import { getRebalancingStrategies, saveRebalancingStrategy } from '@/commands/rebalancing';

/**
 * Generate a deterministic ID for a virtual portfolio based on account IDs
 * Sorts account IDs to ensure A+B = B+A
 */
export function generateVirtualPortfolioId(accountIds: string[]): string {
  const sortedIds = [...accountIds].sort();
  return `virtual_${sortedIds.join('_')}`;
}

/**
 * Generate a user-friendly name for a virtual portfolio
 */
export function generateVirtualPortfolioName(accounts: Account[]): string {
  const names = accounts.map((acc) => acc.name).slice(0, 3); // Show first 3 names
  if (accounts.length > 3) {
    return `Virtual Portfolio: ${names.join(', ')} +${accounts.length - 3} more`;
  }
  return `Virtual Portfolio: ${names.join(' + ')}`;
}

/**
 * Get or create a virtual portfolio strategy for multiple accounts
 * Returns the strategy ID that should be used for saving targets
 */
export async function getOrCreateVirtualStrategy(
  accountIds: string[],
  accounts: Account[]
): Promise<RebalancingStrategy> {
  // Generate deterministic ID based on sorted account IDs
  const virtualId = generateVirtualPortfolioId(accountIds);

  // Check if strategy already exists
  const strategies = await getRebalancingStrategies();
  const existing = strategies.find((s) => s.id === virtualId);

  if (existing) {
    console.log('Found existing virtual strategy:', existing);
    return existing;
  }

  // Create new virtual strategy
  const name = generateVirtualPortfolioName(accounts);
  console.log('Creating new virtual strategy:', virtualId, name);

  const newStrategy = await saveRebalancingStrategy({
    id: virtualId, // Use deterministic ID
    name,
    accountId: null, // Virtual portfolios don't link to a specific account
    isActive: true,
  } as any);

  return newStrategy;
}

/**
 * Check if a strategy is a virtual portfolio
 */
export function isVirtualPortfolio(strategy: RebalancingStrategy): boolean {
  return strategy.name.startsWith('Virtual Portfolio:');
}
