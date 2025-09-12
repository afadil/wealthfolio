import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AccountForm } from "./account-form";
import type { Account } from "@/lib/types";
import { useSettingsContext } from "@/lib/settings-provider";

export interface AccountEditModalProps {
  account?: Account;
  open?: boolean;
  onClose?: () => void;
}

export function AccountEditModal({ account, open, onClose }: AccountEditModalProps) {
  const { settings } = useSettingsContext();
  const defaultValues = {
    id: account?.id || undefined,
    name: account?.name || "",
    balance: account?.balance || 0,
    accountType: (account?.accountType || "SECURITIES") as "SECURITIES" | "CASH" | "CRYPTOCURRENCY",
    group: account?.group ?? undefined,
    currency: account?.currency || settings?.baseCurrency || "USD",
    isDefault: account?.isDefault || false,
    isActive: account?.id ? account?.isActive : true,
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[625px]">
        <AccountForm defaultValues={defaultValues} onSuccess={onClose} />
      </DialogContent>
    </Dialog>
  );
}
