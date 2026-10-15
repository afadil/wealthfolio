import { getTransferPairForActivity } from "@/adapters";
import { isSecuritiesTransfer } from "@/lib/activity-utils";
import { ActivityType } from "@/lib/constants";
import { generateId } from "@/lib/id";
import type { ActivityCreate, ActivityDetails } from "@/lib/types";
import { isSameAccountCashFxConversion } from "../components/transfer-link-utils";
import { isLinkedInternalTransfer } from "./transfer-counterpart";

/** Resolve the whole exchange even when its other leg is on another page. */
export async function buildSameAccountFxDuplicate(activity: ActivityDetails) {
  if (
    !isLinkedInternalTransfer(activity) ||
    isSecuritiesTransfer(activity.activityType, activity.assetSymbol, activity.assetId)
  ) {
    return null;
  }
  const pair = await getTransferPairForActivity(activity.id);
  if (!pair || ![pair.transferOut.id, pair.transferIn.id].includes(activity.id)) {
    throw new Error("Cannot duplicate an unresolved transfer pair.");
  }
  if (!isSameAccountCashFxConversion(pair.transferOut, pair.transferIn)) return null;

  const sourceGroupId = generateId("wf-transfer");
  const activityDate = new Date();
  return [pair.transferOut, pair.transferIn].map(
    (leg, index) =>
      ({
        idempotencyKey: generateId("manual-duplicate"),
        sourceGroupId,
        accountId: leg.accountId,
        activityType: index === 0 ? ActivityType.TRANSFER_OUT : ActivityType.TRANSFER_IN,
        activityDate,
        amount: leg.amount,
        currency: leg.currency,
        fee: leg.fee,
        tax: leg.tax,
        fxRate: leg.fxRate,
        comment: leg.notes,
        metadata: { flow: { is_external: false } },
      }) satisfies ActivityCreate,
  );
}
