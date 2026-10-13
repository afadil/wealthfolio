import type { ProfileSummary } from "./api";
import { PROFILE_AVATARS } from "./avatar-catalog";

const STARTUP_HINT_KEY = "wealthfolio-profile-opening";
const MAX_AGE_MS = 5 * 60 * 1000;

/** Public presentation metadata only. Never used to authorize a profile. */
export function rememberOpeningProfile(profile: ProfileSummary) {
  try {
    sessionStorage.setItem(
      STARTUP_HINT_KEY,
      JSON.stringify({
        id: profile.id,
        name: profile.name,
        avatarId: profile.avatarId,
        at: Date.now(),
      }),
    );
  } catch {
    /* Presentation cache is optional. */
  }
}

export function openingProfileHint(): Pick<ProfileSummary, "id" | "name" | "avatarId"> | undefined {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(STARTUP_HINT_KEY) || "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
    const value = parsed as Record<string, unknown>;
    if (
      value &&
      typeof value.id === "string" &&
      typeof value.name === "string" &&
      value.id.length <= 64 &&
      value.name.length <= 100 &&
      typeof value.avatarId === "string" &&
      PROFILE_AVATARS.some((avatar) => avatar === value.avatarId) &&
      typeof value.at === "number" &&
      Date.now() >= value.at &&
      Date.now() - value.at < MAX_AGE_MS
    ) {
      return { id: value.id, name: value.name, avatarId: value.avatarId };
    }
  } catch {
    /* Ignore malformed or unavailable presentation storage. */
  }
}

export function clearOpeningProfile() {
  try {
    sessionStorage.removeItem(STARTUP_HINT_KEY);
  } catch {
    /* Optional cache. */
  }
}
