import { Dialog, DialogContent } from "@wealthfolio/ui/components/ui/dialog";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { useSettingsContext } from "@/lib/settings-provider";
import { getTrackingMode, type Account } from "@/lib/types";
import { AccountForm } from "./account-form";

export interface AccountEditModalProps {
  account?: Account;
  open?: boolean;
  onClose?: () => void;
}

export function AccountEditModal({ account, open, onClose }: AccountEditModalProps) {
  const { settings } = useSettingsContext();

  // Extract tracking mode from meta for existing accounts, undefined for new accounts
  const trackingMode = account ? getTrackingMode(account) : undefined;

  const defaultValues = {
    id: account?.id ?? undefined,
    name: account?.name ?? "",
    balance: account?.balance ?? 0,
    accountType: (account?.accountType ?? "SECURITIES") as "SECURITIES" | "CASH" | "CRYPTOCURRENCY",
    group: account?.group ?? undefined,
    currency: account?.currency ?? settings?.baseCurrency ?? "USD",
    isDefault: account?.isDefault ?? false,
    isActive: account?.id ? account?.isActive : true,
    trackingMode: trackingMode,
    meta: account?.meta,
  };

  return (
    <Dialog open={open} onOpenChange={onClose} useIsMobile={useIsMobileViewport}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[625px]">
        <AccountForm defaultValues={defaultValues} onSuccess={onClose} />
      </DialogContent>
    </Dialog>
  );
}
