import { WEALTHFOLIO_CONNECT_PORTAL_URL } from "@/lib/constants";

/** Discreet "Connect account" links that open the in-app Connect page. */
const CONNECT_PAGE_PLACEMENTS = [
  "settings_accounts",
  "activities_menu",
  "activities_empty",
  "account_empty",
  "import_result",
] as const;

export type ConnectPagePlacement = (typeof CONNECT_PAGE_PLACEMENTS)[number];

export type ConnectLinkPlacement =
  | "app_onboarding"
  | "connect_empty_state"
  | "subscription_plans"
  | ConnectPagePlacement;

/** In-app Connect page path that remembers which link opened it. */
export function connectPagePath(placement: ConnectPagePlacement): string {
  return `/connect?placement=${placement}`;
}

/** Reads a placement from the Connect page URL, ignoring unknown values. */
export function parseConnectPagePlacement(value: string | null): ConnectPagePlacement | undefined {
  return CONNECT_PAGE_PLACEMENTS.find((placement) => placement === value);
}

export function buildConnectUrl(
  runtime: { isWeb: boolean; isMobile?: boolean },
  placement: ConnectLinkPlacement,
  plan?: string,
): string {
  const url = new URL(plan ? "/onboarding" : "/", WEALTHFOLIO_CONNECT_PORTAL_URL);
  url.searchParams.set(
    "source",
    runtime.isWeb
      ? "self_hosted"
      : runtime.isMobile === undefined
        ? "unknown"
        : runtime.isMobile
          ? "mobile_app"
          : "desktop_app",
  );
  url.searchParams.set("placement", placement);
  if (plan) url.searchParams.set("plan", plan);
  return url.toString();
}
