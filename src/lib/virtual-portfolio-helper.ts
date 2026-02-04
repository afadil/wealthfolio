import type { Account, RebalancingStrategy } from "./types";
import { getRebalancingStrategies, saveRebalancingStrategy } from "@/commands/rebalancing";

/**
 * Generate a deterministic ID for a virtual portfolio based on account IDs
 * Sorts account IDs to ensure A+B = B+A
 */
export function generateVirtualPortfolioId(accountIds: string[]): string {
  const sortedIds = [...accountIds].sort();
  return `virtual_${sortedIds.join("_")}`;
}

/**
 * Generate a user-friendly name for a virtual portfolio
 */
export function generateVirtualPortfolioName(accounts: Account[]): string {
  const names = accounts.map((acc) => acc.name).slice(0, 3); // Show first 3 names
  if (accounts.length > 3) {
    return `Virtual Portfolio: ${names.join(", ")} +${accounts.length - 3} more`;
  }
  return `Virtual Portfolio: ${names.join(" + ")}`;
}

/**
 * Get or create a virtual portfolio strategy for multiple accounts
 * Returns the strategy ID that should be used for saving targets
 *
 * NOTE: We search by name instead of ID because:
 * - Name is deterministic based on account names
 * - If user renames accounts, they'll get a new virtual strategy (correct behavior)
 * - Avoids "Record not found" errors when trying to UPDATE non-existent ID
 */
export async function getOrCreateVirtualStrategy(
  accounts: Account[],
): Promise<RebalancingStrategy> {
  // Generate deterministic name
  const name = generateVirtualPortfolioName(accounts);

  // Check if strategy already exists (search by name)
  const strategies = await getRebalancingStrategies();
  const existing = strategies.find((s) => s.name === name);

  if (existing) {
    console.log("Found existing virtual strategy:", existing);
    return existing;
  }

  // Create new virtual strategy
  console.log("Creating new virtual strategy:", name);

  // Don't pass ID - let backend generate UUID
  // Passing ID would trigger UPDATE logic instead of CREATE
  const newStrategy = await saveRebalancingStrategy({
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
  return strategy.name.startsWith("Virtual Portfolio:");
}
