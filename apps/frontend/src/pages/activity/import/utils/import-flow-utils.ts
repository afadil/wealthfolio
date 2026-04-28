import type { ParseConfig } from "../context";

export function mergeDetectedParseConfig(
  currentConfig: ParseConfig,
  detectedConfig?: Partial<ParseConfig>,
): ParseConfig {
  return {
    ...currentConfig,
    ...(detectedConfig ?? {}),
  };
}

export function shouldUseSavedHoldingsMapping(suppressLinkedTemplate: boolean): boolean {
  return !suppressLinkedTemplate;
}
