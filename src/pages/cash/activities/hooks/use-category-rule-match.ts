import { applyCategoryRules } from "@/commands/category-rule";
import { CategoryMatch } from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { debounce } from "lodash";

interface UseCategoryRuleMatchOptions {
  name: string;
  accountId?: string | null;
  enabled?: boolean;
}

interface UseCategoryRuleMatchResult {
  match: CategoryMatch | null;
  isLoading: boolean;
  isAutoCategorized: boolean;
  clearMatch: () => void;
}

const DEBOUNCE_MS = 500;

export function useCategoryRuleMatch({
  name,
  accountId,
  enabled = true,
}: UseCategoryRuleMatchOptions): UseCategoryRuleMatchResult {
  const [match, setMatch] = useState<CategoryMatch | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoCategorized, setIsAutoCategorized] = useState(false);

  // Keep track of the latest request to avoid race conditions
  const latestRequestRef = useRef<string | null>(null);

  const performMatch = useCallback(
    async (searchName: string, searchAccountId?: string | null) => {
      if (!searchName || searchName.trim().length === 0) {
        setMatch(null);
        setIsAutoCategorized(false);
        return;
      }

      const requestId = `${searchName}-${searchAccountId || ""}`;
      latestRequestRef.current = requestId;

      setIsLoading(true);
      try {
        const result = await applyCategoryRules(searchName, searchAccountId);

        // Only update if this is still the latest request
        if (latestRequestRef.current === requestId) {
          setMatch(result);
          setIsAutoCategorized(result !== null);
        }
      } catch (error) {
        // Only clear if this is still the latest request
        if (latestRequestRef.current === requestId) {
          setMatch(null);
          setIsAutoCategorized(false);
        }
      } finally {
        // Only update loading if this is still the latest request
        if (latestRequestRef.current === requestId) {
          setIsLoading(false);
        }
      }
    },
    [],
  );

  // Create debounced version
  const debouncedMatch = useCallback(
    debounce((searchName: string, searchAccountId?: string | null) => {
      performMatch(searchName, searchAccountId);
    }, DEBOUNCE_MS),
    [performMatch],
  );

  // Trigger match when name changes
  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!name || name.trim().length === 0) {
      setMatch(null);
      setIsAutoCategorized(false);
      setIsLoading(false);
      debouncedMatch.cancel();
      return;
    }

    setIsLoading(true);
    debouncedMatch(name, accountId);

    return () => {
      debouncedMatch.cancel();
    };
  }, [name, accountId, enabled, debouncedMatch]);

  const clearMatch = useCallback(() => {
    setMatch(null);
    setIsAutoCategorized(false);
    latestRequestRef.current = null;
  }, []);

  return {
    match,
    isLoading,
    isAutoCategorized,
    clearMatch,
  };
}
