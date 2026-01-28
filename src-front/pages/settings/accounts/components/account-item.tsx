import { Avatar, AvatarFallback, AvatarImage } from "@wealthfolio/ui/components/ui/avatar";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Icons, type Icon } from "@wealthfolio/ui/components/ui/icons";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import type { Account, AccountType, Platform } from "@/lib/types";
import { Link } from "react-router-dom";
import { AccountOperations } from "./account-operations";
import { TrackingModeBadge } from "@/components/tracking-mode-badge";

// Map account types to icons for visual distinction
const accountTypeIcons: Record<AccountType, Icon> = {
  SECURITIES: Icons.Briefcase,
  CASH: Icons.DollarSign,
  CRYPTOCURRENCY: Icons.Bitcoin,
  PROPERTY: Icons.Home,
  VEHICLE: Icons.Activity2,
  COLLECTIBLE: Icons.Star,
  PRECIOUS: Icons.HandCoins,
  LIABILITY: Icons.CreditCard,
  OTHER: Icons.Package,
};

export interface AccountItemProps {
  account: Account;
  platform?: Platform | null;
  onEdit: (account: Account) => void;
  onDelete: (account: Account) => void;
}

export function AccountItem({ account, platform, onEdit, onDelete }: AccountItemProps) {
  // Check if account is synced from broker (has provider_account_id set)
  const isSynced = !!account.providerAccountId;
  const IconComponent = accountTypeIcons[account.accountType] ?? Icons.Wallet;

  return (
    <div className="flex items-center justify-between p-4">
      <div className="flex items-center gap-3">
        {/* Avatar with platform logo or account type icon */}
        <Avatar className="h-10 w-10 rounded-lg">
          {isSynced && platform?.logoUrl ? (
            <AvatarImage
              src={platform.logoUrl}
              alt={platform.name || "Platform"}
              className="bg-white object-contain p-1"
            />
          ) : null}
          <AvatarFallback className="bg-muted rounded-lg">
            <IconComponent className="text-muted-foreground h-5 w-5" />
          </AvatarFallback>
        </Avatar>

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
            {isSynced && <Icons.CloudSync2 className="text-muted-foreground h-3.5 w-3.5" />}
          </div>
          <div className="flex items-center gap-2">
            <p className="text-muted-foreground text-sm">
              {account.currency}
              {account.group && <span> - {account.group}</span>}
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-4">
        <TrackingModeBadge account={account} />
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
