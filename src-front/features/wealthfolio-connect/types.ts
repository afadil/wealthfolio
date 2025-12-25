// Wealthfolio Connect Types
// =========================

// ─────────────────────────────────────────────────────────────────────────────
// Broker Sync Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncConnectionsResponse {
  synced: number;
  platforms_created: number;
  platforms_updated: number;
}

export interface SyncAccountsResponse {
  synced: number;
  created: number;
  updated: number;
  skipped: number;
}

export interface SyncActivitiesResponse {
  accounts_synced: number;
  activities_upserted: number;
  assets_inserted: number;
  accounts_failed: number;
}

export interface SyncResult {
  success: boolean;
  message: string;
  connectionsSynced: SyncConnectionsResponse | null;
  accountsSynced: SyncAccountsResponse | null;
  activitiesSynced: SyncActivitiesResponse | null;
}

export interface BrokerConnectionBrokerage {
  id?: string;
  slug?: string;
  name?: string;
  displayName?: string;
  awsS3LogoUrl?: string;
  awsS3SquareLogoUrl?: string;
}

export interface BrokerConnection {
  id: string;
  brokerage?: BrokerConnectionBrokerage;
  disabled?: boolean;
  disabledDate?: string;
  updatedAt?: string;
}

export interface ConnectPortalResponse {
  redirectUri?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Plans Types
// ─────────────────────────────────────────────────────────────────────────────

export type PlanId = "essentials" | "duo" | "plus";
export type BillingPeriod = "monthly" | "yearly";

export interface PlanPricing {
  amount: number;
  currency: string;
  priceId: string | undefined;
}

export interface SubscriptionPlan {
  id: PlanId;
  name: string;
  description: string;
  features: string[];
  pricing: {
    monthly: PlanPricing;
    yearly: PlanPricing;
  };
}

export interface PlansResponse {
  plans: SubscriptionPlan[];
}

// ─────────────────────────────────────────────────────────────────────────────
// User Info Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UserTeam {
  id: string;
  name: string;
  logoUrl: string | null;
  plan: string;
  subscriptionStatus: string | null;
  subscriptionCurrentPeriodEnd: string | null;
  subscriptionCancelAtPeriodEnd: boolean | null;
  trialEndsAt: string | null;
}

export type DateFormat = "dd/MM/yyyy" | "MM/dd/yyyy" | "yyyy-MM-dd" | "dd.MM.yyyy";

export interface UserInfo {
  id: string;
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
  locale: string | null;
  weekStartsOnMonday: boolean | null;
  timezone: string | null;
  timezoneAutoSync: boolean | null;
  timeFormat: number | null;
  dateFormat: DateFormat | null;
  teamId: string | null;
  teamRole: string | null;
  team: UserTeam | null;
}
