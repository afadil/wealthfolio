import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { useSettingsContext } from "@/lib/settings-provider";
import type { Account } from "@/lib/types";
import { AccountForm } from "./account-form";

export interface AccountEditModalProps {
  account?: Account;
  open?: boolean;
  onClose?: () => void;
}

export function AccountEditModal({ account, open, onClose }: AccountEditModalProps) {
  const { settings } = useSettingsContext();
  const defaultValues = {
    id: account?.id ?? undefined,
    name: account?.name ?? "",
    balance: account?.balance ?? 0,
    accountType: (account?.accountType ?? "SECURITIES") as "SECURITIES" | "CASH" | "CRYPTOCURRENCY",
    group: account?.group ?? undefined,
    currency: account?.currency ?? settings?.baseCurrency ?? "USD",
    isDefault: account?.isDefault ?? false,
    isActive: account?.id ? account?.isActive : true,
  };

  return (
    <Dialog open={open} onOpenChange={onClose} useIsMobile={useIsMobileViewport}>
      <DialogContent className="sm:max-w-[625px]">
        <AccountForm defaultValues={defaultValues} onSuccess={onClose} />
      </DialogContent>
    </Dialog>
  );
}
