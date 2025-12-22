/**
 * Device detection utilities
 */

/**
 * Detect if the current device is an Apple device (iOS, iPadOS, macOS)
 * Uses multiple detection methods for reliability
 */
export function isAppleDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent.toLowerCase();
  const platform = window.navigator.platform?.toLowerCase() || '';

  // Check for Apple platforms
  const isApplePlatform = /mac|darwin|iphone|ipad|ipod/.test(platform);

  // Check for Apple in user agent
  const isAppleUA = /macintosh|mac os x|iphone|ipad|ipod/.test(userAgent);

  return isApplePlatform || isAppleUA;
}
