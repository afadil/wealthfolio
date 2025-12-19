import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { BudgetConfigDto, NewBudgetConfig } from "@/lib/types";

interface BudgetTargetFormProps {
  config: BudgetConfigDto | null;
  currency: string;
  onSave: (config: NewBudgetConfig) => void;
  isPending?: boolean;
}

export function BudgetTargetForm({ config, currency, onSave, isPending }: BudgetTargetFormProps) {
  const [spendingTarget, setSpendingTarget] = useState<string>("");
  const [incomeTarget, setIncomeTarget] = useState<string>("");
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (config) {
      setSpendingTarget(config.monthlySpendingTarget.toString());
      setIncomeTarget(config.monthlyIncomeTarget.toString());
      setIsDirty(false);
    }
  }, [config]);

  const handleSpendingChange = (value: string) => {
    setSpendingTarget(value);
    setIsDirty(true);
  };

  const handleIncomeChange = (value: string) => {
    setIncomeTarget(value);
    setIsDirty(true);
  };

  const handleSave = () => {
    const newConfig: NewBudgetConfig = {
      monthlySpendingTarget: spendingTarget || "0",
      monthlyIncomeTarget: incomeTarget || "0",
      currency,
    };
    onSave(newConfig);
    setIsDirty(false);
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icons.TrendingDown className="h-4 w-4 text-destructive" />
            Monthly Spending Target
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{currency}</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={spendingTarget}
              onChange={(e) => handleSpendingChange(e.target.value)}
              className="text-lg font-semibold"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icons.TrendingUp className="h-4 w-4 text-success" />
            Monthly Income Target
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{currency}</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={incomeTarget}
              onChange={(e) => handleIncomeChange(e.target.value)}
              className="text-lg font-semibold"
            />
          </div>
        </CardContent>
      </Card>

      {isDirty && (
        <div className="sm:col-span-2">
          <Button onClick={handleSave} disabled={isPending} className="w-full sm:w-auto">
            {isPending ? (
              <>
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Targets"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
