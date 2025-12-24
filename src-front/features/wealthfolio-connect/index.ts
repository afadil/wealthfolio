// Wealthfolio Connect Feature
// ============================

// Provider and hook
export {
  WealthfolioConnectProvider,
  useWealthfolioConnect,
} from "./providers/wealthfolio-connect-provider";

// Components
export { ConnectedView } from "./components/connected-view";
export { LoginForm } from "./components/login-form";
export { SubscriptionPlans } from "./components/subscription-plans";
export { ProviderButton } from "./components/provider-button";

// Services
export {
  syncBrokerData,
  getSyncedAccounts,
  getPlatforms,
  listBrokerConnections,
  removeBrokerConnection,
  getConnectPortalUrl,
  getSubscriptionPlans,
  getUserInfo,
} from "./services/broker-service";

export {
  storeSyncSession,
  clearSyncSession,
} from "./services/auth-service";

// Types
export type {
  SyncConnectionsResponse,
  SyncAccountsResponse,
  SyncActivitiesResponse,
  SyncResult,
  BrokerConnectionBrokerage,
  BrokerConnection,
  ConnectPortalResponse,
  PlanId,
  BillingPeriod,
  PlanPricing,
  SubscriptionPlan,
  PlansResponse,
  UserTeam,
  DateFormat,
  UserInfo,
} from "./types";
