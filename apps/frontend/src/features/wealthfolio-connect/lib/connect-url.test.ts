import { describe, expect, it } from "vitest";
import { buildConnectUrl, connectPagePath, parseConnectPagePlacement } from "./connect-url";

describe("Connect signup URLs", () => {
  it.each([
    [{ isWeb: false }, "unknown"],
    [{ isWeb: true }, "self_hosted"],
    [{ isWeb: false, isMobile: false }, "desktop_app"],
    [{ isWeb: false, isMobile: true }, "mobile_app"],
    [{ isWeb: true, isMobile: false }, "self_hosted"],
    [{ isWeb: true, isMobile: true }, "self_hosted"],
  ] as const)("classifies the app runtime %j", (runtime, source) => {
    const url = new URL(buildConnectUrl(runtime, "subscription_plans", "duo"));
    expect(url.origin).toBe("https://connect.wealthfolio.app");
    expect(url.pathname).toBe("/onboarding");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      source,
      placement: "subscription_plans",
      plan: "duo",
    });
  });
  it("preserves home destinations without adding a plan", () => {
    const url = new URL(buildConnectUrl({ isWeb: false, isMobile: false }, "app_onboarding"));
    expect(url.pathname).toBe("/");
    expect(url.searchParams.has("plan")).toBe(false);
  });
});

describe("Connect page placements", () => {
  it.each([
    "settings_accounts",
    "activities_menu",
    "activities_empty",
    "account_empty",
    "import_result",
  ] as const)("round-trips %s through the Connect page URL", (placement) => {
    const url = new URL(connectPagePath(placement), "http://app.local");
    expect(url.pathname).toBe("/connect");
    expect(parseConnectPagePlacement(url.searchParams.get("placement"))).toBe(placement);
  });

  it.each([null, "", "subscription_plans", "evil"])("ignores %j", (value) => {
    expect(parseConnectPagePlacement(value)).toBeUndefined();
  });
});
