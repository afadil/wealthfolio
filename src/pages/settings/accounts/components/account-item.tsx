import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountOperations } from "./account-operations";
import type { Account } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

export interface AccountItemProps {
  account: Account;
  onEdit: (account: Account) => void;
  onDelete: (account: Account) => void;
}

export function AccountItem({ account, onEdit, onDelete }: AccountItemProps) {
  return (
    <div className="flex items-center justify-between p-4">
      <div className="grid gap-1">
        <Link
          to={`/accounts/${account.id}`}
          className={`font-semibold hover:underline ${
            !account.isActive ? "text-muted-foreground" : ""
          }`}
        >
          {account.name}
        </Link>
        <div>
          <p className="text-muted-foreground text-sm">
            {account.currency}
            {account.group && <span className="text-muted-foreground"> - {account.group}</span>}
          </p>
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
