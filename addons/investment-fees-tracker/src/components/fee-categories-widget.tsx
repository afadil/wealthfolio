import { Card, CardContent, CardHeader, CardTitle } from '@wealthfolio/ui';
import { AmountDisplay, Icons } from '@wealthfolio/ui';
import type { FeeAnalytics } from '../lib/fee-calculation.service';

interface FeeCategoriesWidgetProps {
  feeAnalytics: FeeAnalytics;
  currency: string;
  isBalanceHidden: boolean;
}

export function FeeCategoriesWidget({ 
  feeAnalytics, 
  currency, 
  isBalanceHidden 
}: FeeCategoriesWidgetProps) {
  const { feesByCategory } = feeAnalytics;

  // Calculate total fees for percentage calculations
  const totalFees = feesByCategory.reduce((sum, category) => sum + category.amount, 0);

  // Sort categories to ensure "Other" appears last
  const sortedCategories = [...feesByCategory].sort((a, b) => {
    // If one is "Other" and the other isn't, put "Other" last
    if (a.category.toLowerCase().includes('other') && !b.category.toLowerCase().includes('other')) {
      return 1;
    }
    if (!a.category.toLowerCase().includes('other') && b.category.toLowerCase().includes('other')) {
      return -1;
    }
    // Otherwise maintain original order (already sorted by amount in the service)
    return 0;
  });

  return (
    <Card className="border-purple-500/10 bg-purple-500/10">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Fee Categories</CardTitle>
        <Icons.PieChart className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sortedCategories.map((category, index) => (
            <div key={index} className="flex items-center">
              <div className="w-full">
                <div className="mb-0 flex justify-between">
                  <span className="text-xs">{category.category}</span>
                  <span className="text-xs text-muted-foreground">
                    <AmountDisplay
                      value={category.amount}
                      currency={currency}
                      isHidden={isBalanceHidden}
                    />
                  </span>
                </div>
                <div className="relative h-4 w-full rounded-full bg-primary/20">
                  <div
                    className="flex h-4 items-center justify-center rounded-full bg-primary text-xs text-background"
                    style={{ width: `${category.percentage}%` }}
                  >
                    {category.percentage > 0 ? `${category.percentage.toFixed(1)}%` : ''}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
