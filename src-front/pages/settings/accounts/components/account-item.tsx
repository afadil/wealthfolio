import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import type { Account } from "@/lib/types";
import { Link } from "react-router-dom";
import { AccountOperations } from "./account-operations";

export interface AccountItemProps {
  account: Account;
  onEdit: (account: Account) => void;
  onDelete: (account: Account) => void;
}

export function AccountItem({ account, onEdit, onDelete }: AccountItemProps) {
  // Check if account is synced from broker
  const isSynced = !!account.externalId;

  return (
    <div className="flex items-center justify-between p-4">
      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <Link
            to={`/accounts/${account.id}`}
            className={`font-semibold hover:underline ${
              !account.isActive ? "text-muted-foreground" : ""
            }`}
          >
            {account.name}
          </Link>
          {isSynced && <Icons.CloudSync className="text-muted-foreground h-3.5 w-3.5" />}
        </div>
        <div className="flex items-center gap-2">
          <p className="text-muted-foreground text-sm">
            {account.currency}
            {account.group && <span> - {account.group}</span>}
          </p>
          {account.platformId && (
            <Badge variant="outline" className="text-xs font-normal">
              {account.platformId}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center space-x-4">
        {!account.isActive && <Badge variant="secondary">Disabled</Badge>}
        <AccountOperations account={account} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  );
}

AccountItem.Skeleton = function AccountItemSkeleton() {
  return (
    <div className="p-4">
      <div className="space-y-3">
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
};
