import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { AmountDisplay } from "@wealthfolio/ui";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import type { AlternativeAssetHolding } from "@/lib/types";

interface LinkedLiabilitiesCardProps {
  liabilities: AlternativeAssetHolding[];
  onAddLiability?: () => void;
  className?: string;
}

/**
 * Card displaying liabilities linked to a property or vehicle.
 * Each liability is clickable and navigates to its detail page.
 */
export const LinkedLiabilitiesCard: React.FC<LinkedLiabilitiesCardProps> = ({
  liabilities,
  onAddLiability,
  className,
}) => {
  const navigate = useNavigate();
  const { isBalanceHidden } = useBalancePrivacy();

  const handleLiabilityClick = (liabilityId: string) => {
    navigate(`/holdings/${encodeURIComponent(liabilityId)}`);
  };

  // Don't render if no liabilities and no add button
  if (liabilities.length === 0 && !onAddLiability) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Linked Liabilities</CardTitle>
        {onAddLiability && (
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onAddLiability}>
            <Icons.Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Separator className="mb-4" />

        {liabilities.length > 0 ? (
          <div className="space-y-3">
            {liabilities.map((liability) => (
              <button
                key={liability.id}
                type="button"
                onClick={() => handleLiabilityClick(liability.id)}
                className="hover:bg-muted/50 flex w-full items-center justify-between rounded-lg p-2 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full">
                    <Icons.LiabilityDuotone size={16} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">{liability.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {getLiabilityTypeLabel(liability.metadata)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-destructive text-sm font-medium">
                    <AmountDisplay
                      value={-Math.abs(parseFloat(liability.marketValue))}
                      currency={liability.currency}
                      isHidden={isBalanceHidden}
                    />
                  </span>
                  <Icons.ChevronRight className="text-muted-foreground h-4 w-4" />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground py-4 text-center text-sm">
            <p>No linked mortgages or loans</p>
            {onAddLiability && (
              <Button variant="link" size="sm" className="mt-1" onClick={onAddLiability}>
                Add a mortgage or loan
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const LIABILITY_TYPE_LABELS: Record<string, string> = {
  mortgage: "Mortgage",
  auto_loan: "Auto Loan",
  student_loan: "Student Loan",
  credit_card: "Credit Card",
  personal_loan: "Personal Loan",
  heloc: "HELOC",
};

function getLiabilityTypeLabel(metadata?: Record<string, unknown>): string {
  if (!metadata) return "Liability";
  const liabilityType = metadata.liability_type as string | undefined;
  if (!liabilityType) return "Liability";
  return LIABILITY_TYPE_LABELS[liabilityType] || liabilityType;
}

/**
 * Section variant for embedding in another card.
 * Shows linked liabilities without the Card wrapper.
 */
interface LinkedLiabilitiesSectionProps {
  liabilities: AlternativeAssetHolding[];
  onAddLiability?: () => void;
}

export const LinkedLiabilitiesSection: React.FC<LinkedLiabilitiesSectionProps> = ({
  liabilities,
  onAddLiability,
}) => {
  const navigate = useNavigate();
  const { isBalanceHidden } = useBalancePrivacy();

  const handleLiabilityClick = (liabilityId: string) => {
    navigate(`/holdings/${encodeURIComponent(liabilityId)}`);
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">Linked Liabilities</span>
        {onAddLiability && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onAddLiability}>
            <Icons.Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        )}
      </div>

      {liabilities.length > 0 ? (
        <div className="space-y-2">
          {liabilities.map((liability) => (
            <button
              key={liability.id}
              type="button"
              onClick={() => handleLiabilityClick(liability.id)}
              className="bg-muted/50 hover:bg-muted flex w-full items-center justify-between rounded-lg p-2 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full">
                  <Icons.LiabilityDuotone size={16} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">{liability.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {getLiabilityTypeLabel(liability.metadata)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-destructive text-sm font-medium">
                  <AmountDisplay
                    value={-Math.abs(parseFloat(liability.marketValue))}
                    currency={liability.currency}
                    isHidden={isBalanceHidden}
                  />
                </span>
                <Icons.ChevronRight className="text-muted-foreground h-4 w-4" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground py-2 text-center text-sm">
          <p>No linked mortgages or loans</p>
          {onAddLiability && (
            <Button variant="link" size="sm" className="mt-1" onClick={onAddLiability}>
              Add a mortgage or loan
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Section variant for showing a linked asset (for liabilities).
 * Shows the property/vehicle this liability is linked to.
 */
interface LinkedAssetSectionProps {
  assetId: string;
  assetName: string;
  assetKind?: string;
  assetValue?: string;
  currency?: string;
}

export const LinkedAssetSection: React.FC<LinkedAssetSectionProps> = ({
  assetId,
  assetName,
  assetKind,
  assetValue,
  currency,
}) => {
  const navigate = useNavigate();
  const { isBalanceHidden } = useBalancePrivacy();

  const handleAssetClick = () => {
    navigate(`/holdings/${encodeURIComponent(assetId)}`);
  };

  // Get icon based on asset kind
  const AssetIcon =
    assetKind?.toLowerCase() === "vehicle" ? Icons.VehicleDuotone : Icons.RealEstateDuotone;
  const kindLabel = assetKind?.toLowerCase() === "vehicle" ? "Vehicle" : "Property";

  return (
    <div>
      <div className="mb-3">
        <span className="text-sm font-medium">Linked Asset</span>
      </div>

      <button
        type="button"
        onClick={handleAssetClick}
        className="bg-muted/50 hover:bg-muted flex w-full items-center justify-between rounded-lg p-2 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full">
            <AssetIcon size={16} />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium">{assetName}</p>
            <p className="text-muted-foreground text-xs">{kindLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {assetValue && currency && (
            <span className="text-success text-sm font-medium">
              <AmountDisplay
                value={parseFloat(assetValue)}
                currency={currency}
                isHidden={isBalanceHidden}
              />
            </span>
          )}
          <Icons.ChevronRight className="text-muted-foreground h-4 w-4" />
        </div>
      </button>
    </div>
  );
};

export default LinkedLiabilitiesCard;
