/**
 * Cookie utility functions for managing browser cookies
 */

export const COOKIE_NAMES = {
  PREFERRED_SIGNIN_PROVIDER: 'wealthfolio_preferred_signin_provider',
} as const;

// Cookie max-age: 1 year in seconds
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Get cookie value by name
 */
export function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;

  const regex = new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)');
  const matches = regex.exec(document.cookie);
  return matches ? decodeURIComponent(matches[1]) : null;
}

/**
 * Set cookie with name, value, and max-age
 */
export function setCookie(name: string, value: string, maxAge: number = ONE_YEAR_SECONDS): void {
  if (typeof document === 'undefined') return;

  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
}

/**
 * Delete cookie by name
 */
export function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;

  document.cookie = `${name}=; max-age=0; path=/`;
}

/**
 * Get preferred sign-in provider from cookie
 */
export function getPreferredProvider(): 'google' | 'email' | null {
  const value = getCookieValue(COOKIE_NAMES.PREFERRED_SIGNIN_PROVIDER);
  if (value === 'google' || value === 'email') {
    return value;
  }
  return null;
}

/**
 * Save preferred sign-in provider to cookie
 */
export function savePreferredProvider(provider: 'google' | 'email'): void {
  setCookie(COOKIE_NAMES.PREFERRED_SIGNIN_PROVIDER, provider);
}
