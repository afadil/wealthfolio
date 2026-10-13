import { usePersistentState as useStoredState } from "@wealthfolio/ui";
import { selectedProfileId, usesLegacyPreferences } from "@/features/profiles/session";
function profilePreferencePrefix(profileId: string) {
  return `profile:${profileId}:`;
}
export function clearProfilePreferences(profileId: string) {
  const prefix = profilePreferencePrefix(profileId);
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(prefix)) localStorage.removeItem(key);
    }
  } catch {
    // Browser storage can be unavailable; profile data lives in the database.
  }
}
export function profilePreferenceKey(key: string) {
  const profile = selectedProfileId();
  return profile ? `${profilePreferencePrefix(profile)}${key}` : key;
}
export function readProfilePreference(key: string): string | null {
  return (
    localStorage.getItem(profilePreferenceKey(key)) ??
    (usesLegacyPreferences() ? localStorage.getItem(key) : null)
  );
}
export function usePersistentState<T>(key: string, initial: T) {
  return useStoredState(
    profilePreferenceKey(key),
    initial,
    usesLegacyPreferences() ? key : undefined,
  );
}
