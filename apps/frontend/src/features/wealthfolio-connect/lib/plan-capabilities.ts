import type { UserInfo } from "../types";

export function hasBrokerSync(userInfo: UserInfo | null): boolean {
  const team = userInfo?.team;
  if (!team) return false;
  const isActive = team.subscription_status === "active" || team.subscription_status === "trialing";
  if (!isActive) return false;
  if (!team.plan) return false;
  return team.plan !== "basic";
}
