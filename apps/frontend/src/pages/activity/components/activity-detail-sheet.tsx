import { ActivityStatus, ActivityTypeNames, SUBTYPE_DISPLAY_NAMES } from "@/lib/constants";
import type { ActivityDetails } from "@/lib/types";
import {
  Badge,
  Icons,
  Separator,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@wealthfolio/ui";
import { AmountDisplay } from "@wealthfolio/ui/components/financial/amount-display";
import { format } from "date-fns";

interface ActivityDetailSheetProps {
  activity: ActivityDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Status display configuration
const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  [ActivityStatus.POSTED]: { label: "Posted", variant: "default" },
  [ActivityStatus.PENDING]: { label: "Pending", variant: "secondary" },
  [ActivityStatus.DRAFT]: { label: "Draft", variant: "outline" },
  [ActivityStatus.VOID]: { label: "Void", variant: "destructive" },
};

interface DetailRowProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}

function DetailRow({ label, value, icon }: DetailRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-right text-sm font-medium">{value}</div>
    </div>
  );
}

interface DetailSectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

function DetailSection({ title, icon, children }: DetailSectionProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 pb-2">
        {icon}
        <h4 className="text-sm font-semibold">{title}</h4>
      </div>
      <div className="bg-muted/30 rounded-lg border p-3">{children}</div>
    </div>
  );
}

export function ActivityDetailSheet({ activity, open, onOpenChange }: ActivityDetailSheetProps) {
  if (!activity) return null;

  const statusConfig = activity.status
    ? STATUS_CONFIG[activity.status] || { label: activity.status, variant: "default" as const }
    : null;

  const subtypeDisplay = activity.subtype
    ? SUBTYPE_DISPLAY_NAMES[activity.subtype] || activity.subtype
    : null;

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return "—";
    const d = typeof date === "string" ? new Date(date) : date;
    return format(d, "PPpp");
  };

  const formatShortDate = (date: Date | string | undefined) => {
    if (!date) return "—";
    const d = typeof date === "string" ? new Date(date) : date;
    return format(d, "PP");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-3">
            <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
              <Icons.Receipt className="text-primary h-5 w-5" />
            </div>
            <div className="flex flex-col items-start">
              <span>Activity Details</span>
              <span className="text-muted-foreground text-xs font-normal">
                {activity.assetSymbol || "Cash Transaction"}
              </span>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 pb-8">
          {/* Header Summary */}
          <div className="from-primary/5 to-primary/10 rounded-xl border bg-gradient-to-br p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-muted-foreground mb-1 text-xs uppercase tracking-wide">
                  {ActivityTypeNames[activity.activityType] || activity.activityType}
                </div>
                {activity.assetSymbol && (
                  <div className="text-xl font-bold">{activity.assetSymbol}</div>
                )}
                {activity.assetName && (
                  <div className="text-muted-foreground text-sm">{activity.assetName}</div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                {statusConfig && <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>}
                {activity.needsReview && (
                  <Badge variant="outline" className="border-amber-500 text-amber-600">
                    <Icons.AlertCircle className="mr-1 h-3 w-3" />
                    Needs Review
                  </Badge>
                )}
              </div>
            </div>
            <Separator className="my-3" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-muted-foreground text-xs">Date</div>
                <div className="font-medium">{formatShortDate(activity.date)}</div>
              </div>
              <div className="text-right">
                <div className="text-muted-foreground text-xs">Amount</div>
                <div className="text-lg font-bold">
                  <AmountDisplay value={Number(activity.amount)} currency={activity.currency} />
                </div>
              </div>
            </div>
          </div>

          {/* Transaction Details */}
          <DetailSection title="Transaction" icon={<Icons.ArrowLeftRight className="h-4 w-4" />}>
            <DetailRow
              label="Type"
              value={
                <Badge variant="outline">
                  {ActivityTypeNames[activity.activityType] || activity.activityType}
                </Badge>
              }
            />
            {subtypeDisplay && <DetailRow label="Subtype" value={subtypeDisplay} />}
            <DetailRow label="Date & Time" value={formatDate(activity.date)} />
            <DetailRow label="Account" value={activity.accountName} />
          </DetailSection>

          {/* Financial Details */}
          <DetailSection title="Financial Details" icon={<Icons.DollarSign className="h-4 w-4" />}>
            {Number(activity.quantity) !== 0 && (
              <DetailRow
                label="Quantity"
                value={Number(activity.quantity).toLocaleString(undefined, {
                  maximumFractionDigits: 8,
                })}
              />
            )}
            {Number(activity.unitPrice) !== 0 && (
              <DetailRow
                label="Unit Price"
                value={
                  <AmountDisplay value={Number(activity.unitPrice)} currency={activity.currency} />
                }
              />
            )}
            <DetailRow
              label="Amount"
              value={<AmountDisplay value={Number(activity.amount)} currency={activity.currency} />}
            />
            {Number(activity.fee) !== 0 && (
              <DetailRow
                label="Fee"
                value={<AmountDisplay value={Number(activity.fee)} currency={activity.currency} />}
              />
            )}
            {activity.fxRate && (
              <DetailRow
                label="FX Rate"
                value={Number(activity.fxRate).toLocaleString(undefined, {
                  maximumFractionDigits: 8,
                })}
              />
            )}
            <DetailRow label="Currency" value={activity.currency} />
            {activity.accountCurrency !== activity.currency && (
              <DetailRow label="Account Currency" value={activity.accountCurrency} />
            )}
          </DetailSection>

          {/* Comment */}
          {activity.comment && (
            <DetailSection title="Notes" icon={<Icons.FileText className="h-4 w-4" />}>
              <p className="whitespace-pre-wrap text-sm">{activity.comment}</p>
            </DetailSection>
          )}

          {/* Metadata */}
          <DetailSection title="Record Info" icon={<Icons.Info className="h-4 w-4" />}>
            <DetailRow
              label="ID"
              value={
                <code className="bg-muted max-w-[200px] truncate rounded px-1.5 py-0.5 text-xs">
                  {activity.id}
                </code>
              }
            />
            {activity.assetId && (
              <DetailRow
                label="Asset ID"
                value={
                  <code className="bg-muted max-w-[200px] truncate rounded px-1.5 py-0.5 text-xs">
                    {activity.assetId}
                  </code>
                }
              />
            )}
            {activity.assetQuoteMode && (
              <DetailRow
                label="Quote Mode"
                value={
                  <Badge variant="secondary" className="text-xs">
                    {activity.assetQuoteMode}
                  </Badge>
                }
              />
            )}
            <DetailRow label="Created" value={formatDate(activity.createdAt)} />
            <DetailRow label="Updated" value={formatDate(activity.updatedAt)} />
          </DetailSection>

          {/* Sync & Source Info - only show for synced activities */}
          {activity.sourceSystem && (
            <DetailSection title="Sync Information" icon={<Icons.RefreshCw className="h-4 w-4" />}>
              {activity.sourceRecordId && (
                <DetailRow
                  label="Source Record ID"
                  value={
                    <code className="bg-muted rounded px-1.5 py-0.5 text-xs">
                      {activity.sourceRecordId}
                    </code>
                  }
                />
              )}
              {activity.idempotencyKey && (
                <DetailRow
                  label="Idempotency Key"
                  value={
                    <code className="bg-muted block max-w-[200px] truncate rounded px-1.5 py-0.5 text-xs">
                      {activity.idempotencyKey}
                    </code>
                  }
                />
              )}
              {activity.importRunId && (
                <DetailRow
                  label="Import Run"
                  value={
                    <code className="bg-muted rounded px-1.5 py-0.5 text-xs">
                      {activity.importRunId}
                    </code>
                  }
                />
              )}
              {activity.isUserModified !== undefined && (
                <DetailRow
                  label="User Modified"
                  value={
                    activity.isUserModified ? (
                      <Badge variant="outline" className="text-xs">
                        <Icons.User className="mr-1 h-3 w-3" />
                        Yes
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">No</span>
                    )
                  }
                />
              )}
            </DetailSection>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
