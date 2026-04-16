import type { HealthIssue } from "@/lib/types";
import type { TFunction } from "i18next";

/** Maps backend health issue payloads to UI copy. Keys must match `health.issue.*` in locales. */
export function getHealthIssueDisplayCopy(
  issue: HealthIssue,
  t: TFunction<"common">,
): { title: string; message: string } {
  const parts = issue.id.split(":");
  const head = parts[0] ?? "";
  const n = issue.affectedCount;

  const fallback = { title: issue.title, message: issue.message };

  try {
    switch (head) {
      case "price_stale": {
        const tier = parts[1];
        if (tier === "error") {
          const missingMsg = issue.message.includes("Unable to fetch");
          const mKey = missingMsg
            ? "health.issue.price_stale.error.message_missing"
            : "health.issue.price_stale.error.message_stale";
          const tNoData1 = /^No market data for (.+)$/.exec(issue.title);
          if (tNoData1 && n === 1) {
            return {
              title: t("health.issue.price_stale.error.title_no_data_symbol", { symbol: tNoData1[1] }),
              message: t(mKey),
            };
          }
          const tNoDataN = /^No market data for (\d+) holdings$/.exec(issue.title);
          if (tNoDataN) {
            return {
              title: t("health.issue.price_stale.error.title_no_data_other", {
                count: Number(tNoDataN[1]),
              }),
              message: t(mKey),
            };
          }
          if (/^Outdated price for 1 holding$/.test(issue.title)) {
            return {
              title: t("health.issue.price_stale.error.title_outdated_one"),
              message: t(mKey),
            };
          }
          const tOutN = /^Outdated prices for (\d+) holdings$/.exec(issue.title);
          if (tOutN) {
            return {
              title: t("health.issue.price_stale.error.title_outdated_other", {
                count: Number(tOutN[1]),
              }),
              message: t(mKey),
            };
          }
          return fallback;
        }
        if (tier === "warning") {
          if (/^Price update needed for 1 holding$/.test(issue.title)) {
            return {
              title: t("health.issue.price_stale.warning.title_one"),
              message: t("health.issue.price_stale.warning.message"),
            };
          }
          const tw = /^Price updates needed for (\d+) holdings$/.exec(issue.title);
          if (tw) {
            return {
              title: t("health.issue.price_stale.warning.title_other", { count: Number(tw[1]) }),
              message: t("health.issue.price_stale.warning.message"),
            };
          }
          return fallback;
        }
        return fallback;
      }
      case "fx_missing": {
        if (n === 1) {
          const m = /^Missing exchange rate for (.+)$/.exec(issue.title);
          if (m) {
            return {
              title: t("health.issue.fx_missing.title_one", { currency: m[1] }),
              message: t("health.issue.fx_missing.message"),
            };
          }
        } else {
          const m = /^Missing exchange rates for (\d+) currencies$/.exec(issue.title);
          if (m) {
            return {
              title: t("health.issue.fx_missing.title_other", { count: Number(m[1]) }),
              message: t("health.issue.fx_missing.message"),
            };
          }
        }
        return fallback;
      }
      case "fx_stale": {
        const tier = parts[1];
        if (tier === "error") {
          if (/^Outdated exchange rate$/.test(issue.title)) {
            return {
              title: t("health.issue.fx_stale.error.title_one"),
              message: t("health.issue.fx_stale.error.message"),
            };
          }
          const m = /^Outdated exchange rates for (\d+) currencies$/.exec(issue.title);
          if (m) {
            return {
              title: t("health.issue.fx_stale.error.title_other", { count: Number(m[1]) }),
              message: t("health.issue.fx_stale.error.message"),
            };
          }
          return fallback;
        }
        if (tier === "warning") {
          if (/^Exchange rate update needed$/.test(issue.title)) {
            return {
              title: t("health.issue.fx_stale.warning.title_one"),
              message: t("health.issue.fx_stale.warning.message"),
            };
          }
          const m = /^Exchange rate updates needed for (\d+) currencies$/.exec(issue.title);
          if (m) {
            return {
              title: t("health.issue.fx_stale.warning.title_other", { count: Number(m[1]) }),
              message: t("health.issue.fx_stale.warning.message"),
            };
          }
          return fallback;
        }
        return fallback;
      }
      case "quote_sync": {
        const tier = parts[1];
        if (tier === "error") {
          const one = /^Quotes sync failing for (.+)$/.exec(issue.title);
          if (one && n === 1) {
            return {
              title: t("health.issue.quote_sync.error.title_symbol", { symbol: one[1] }),
              message: t("health.issue.quote_sync.error.message"),
            };
          }
          const many = /^Quotes sync failing for (\d+) assets$/.exec(issue.title);
          if (many) {
            return {
              title: t("health.issue.quote_sync.error.title_other", { count: Number(many[1]) }),
              message: t("health.issue.quote_sync.error.message"),
            };
          }
          return fallback;
        }
        if (tier === "warning") {
          const one = /^Sync issues for (.+)$/.exec(issue.title);
          if (one && n === 1) {
            return {
              title: t("health.issue.quote_sync.warning.title_symbol", { symbol: one[1] }),
              message: t("health.issue.quote_sync.warning.message"),
            };
          }
          const many = /^Sync issues for (\d+) assets$/.exec(issue.title);
          if (many) {
            return {
              title: t("health.issue.quote_sync.warning.title_other", { count: Number(many[1]) }),
              message: t("health.issue.quote_sync.warning.message"),
            };
          }
          return fallback;
        }
        return fallback;
      }
      case "classification": {
        const sub = parts[1];
        if (sub === "legacy_migration") {
          if (n === 1 && /^1 asset has legacy classification data$/.test(issue.title)) {
            return {
              title: t("health.issue.classification.legacy.title_one"),
              message: t("health.issue.classification.legacy.message"),
            };
          }
          const m = /^(\d+) assets have legacy classification data$/.exec(issue.title);
          if (m) {
            return {
              title: t("health.issue.classification.legacy.title_other", { count: Number(m[1]) }),
              message: t("health.issue.classification.legacy.message"),
            };
          }
          return fallback;
        }
        const tax = sub ?? "classification";
        const msgKey =
          tax === "asset_class"
            ? "health.issue.classification.taxonomy.message_asset_class"
            : tax === "sector"
              ? "health.issue.classification.taxonomy.message_sector"
              : tax === "country"
                ? "health.issue.classification.taxonomy.message_country"
                : "health.issue.classification.taxonomy.message_default";
        if (n === 1 && /^1 holding needs a category$/.test(issue.title)) {
          return {
            title: t("health.issue.classification.taxonomy.title_one"),
            message: t(msgKey),
          };
        }
        const m = /^(\d+) holdings need categories$/.exec(issue.title);
        if (m) {
          return {
            title: t("health.issue.classification.taxonomy.title_other", { count: Number(m[1]) }),
            message: t(msgKey),
          };
        }
        return fallback;
      }
      case "orphan_activity_account": {
        if (n === 1 && /^Transaction references missing account$/.test(issue.title)) {
          return {
            title: t("health.issue.data.orphan_account.title_one"),
            message: t("health.issue.data.orphan_account.message"),
          };
        }
        const m = /^(\d+) transactions reference missing accounts$/.exec(issue.title);
        if (m) {
          return {
            title: t("health.issue.data.orphan_account.title_other", { count: Number(m[1]) }),
            message: t("health.issue.data.orphan_account.message"),
          };
        }
        return fallback;
      }
      case "orphan_activity_asset": {
        if (n === 1 && /^Transaction references missing asset$/.test(issue.title)) {
          return {
            title: t("health.issue.data.orphan_asset.title_one"),
            message: t("health.issue.data.orphan_asset.message"),
          };
        }
        const m = /^(\d+) transactions reference missing assets$/.exec(issue.title);
        if (m) {
          return {
            title: t("health.issue.data.orphan_asset.title_other", { count: Number(m[1]) }),
            message: t("health.issue.data.orphan_asset.message"),
          };
        }
        return fallback;
      }
      case "negative_position": {
        if (n === 1 && /^Holding has negative quantity$/.test(issue.title)) {
          return {
            title: t("health.issue.data.negative_position.title_one"),
            message: t("health.issue.data.negative_position.message"),
          };
        }
        const m = /^(\d+) holdings have negative quantities$/.exec(issue.title);
        if (m) {
          return {
            title: t("health.issue.data.negative_position.title_other", { count: Number(m[1]) }),
            message: t("health.issue.data.negative_position.message"),
          };
        }
        return fallback;
      }
      case "legacy_classification": {
        if (n === 1 && /^1 asset has old classification data$/.test(issue.title)) {
          return {
            title: t("health.issue.data.legacy_classification.title_one"),
            message: t("health.issue.data.legacy_classification.message"),
          };
        }
        const m = /^(\d+) assets have old classification data$/.exec(issue.title);
        if (m) {
          return {
            title: t("health.issue.data.legacy_classification.title_other", { count: Number(m[1]) }),
            message: t("health.issue.data.legacy_classification.message"),
          };
        }
        return fallback;
      }
      case "negative_account_balance": {
        if (n === 1 && /^Account has negative portfolio balance$/.test(issue.title)) {
          return {
            title: t("health.issue.data.negative_balance.title_one"),
            message: t("health.issue.data.negative_balance.message"),
          };
        }
        const m = /^(\d+) accounts have negative portfolio balance$/.exec(issue.title);
        if (m) {
          return {
            title: t("health.issue.data.negative_balance.title_other", { count: Number(m[1]) }),
            message: t("health.issue.data.negative_balance.message"),
          };
        }
        return fallback;
      }
      case "unconfigured_accounts": {
        if (n === 1 && /^1 account needs setup$/.test(issue.title)) {
          return {
            title: t("health.issue.account.unconfigured.title_one"),
            message: t("health.issue.account.unconfigured.message_one"),
          };
        }
        const m = /^(\d+) accounts need setup$/.exec(issue.title);
        if (m) {
          return {
            title: t("health.issue.account.unconfigured.title_other", { count: Number(m[1]) }),
            message: t("health.issue.account.unconfigured.message_other"),
          };
        }
        return fallback;
      }
      case "timezone_missing":
        if (/^Timezone not configured$/.test(issue.title)) {
          return {
            title: t("health.issue.timezone.missing.title"),
            message: t("health.issue.timezone.missing.message"),
          };
        }
        return fallback;
      case "timezone_invalid": {
        if (!/^Configured timezone is invalid$/.test(issue.title)) return fallback;
        const m = /^The configured timezone \"(.+)\" is invalid\. Update it in General settings\.$/.exec(
          issue.message,
        );
        if (m) {
          return {
            title: t("health.issue.timezone.invalid.title"),
            message: t("health.issue.timezone.invalid.message", { value: m[1] }),
          };
        }
        return fallback;
      }
      case "timezone_mismatch": {
        if (!/^Browser and app timezones differ$/.test(issue.title)) return fallback;
        const mm =
          /^Configured timezone is \"(.+)\" but browser timezone is \"(.+)\"\. Dates follow the configured timezone\.$/.exec(
            issue.message,
          );
        if (mm) {
          return {
            title: t("health.issue.timezone.mismatch.title"),
            message: t("health.issue.timezone.mismatch.message", {
              configured: mm[1],
              browser: mm[2],
            }),
          };
        }
        return fallback;
      }
      default:
        return fallback;
    }
  } catch {
    return fallback;
  }
}

const FIX_ACTION_KEYS: Record<string, string> = {
  sync_prices: "health.action.sync_prices",
  fetch_fx: "health.action.fetch_fx",
  migrate_classifications: "health.action.migrate_classifications",
  migrate_legacy_classifications: "health.action.migrate_legacy_classifications",
  retry_sync: "health.action.retry_sync",
};

export function getHealthFixActionLabel(actionId: string, t: TFunction<"common">): string {
  const key = FIX_ACTION_KEYS[actionId];
  return key ? t(key) : actionId;
}

export function getHealthNavigateLabel(route: string, t: TFunction<"common">): string {
  const map: Record<string, string> = {
    "/holdings": "health.nav.view_holdings",
    "/activities": "health.nav.view_activities",
    "/settings/accounts": "health.nav.view_accounts",
    "/settings/taxonomies": "health.nav.view_classifications",
    "/settings/market-data": "health.nav.view_market_data",
    "/settings/general": "health.nav.open_general_settings",
    "/connect": "health.nav.configure_accounts",
  };
  const key = map[route];
  return key ? t(key) : route;
}
