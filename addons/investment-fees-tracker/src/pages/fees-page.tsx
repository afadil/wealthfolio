import React, { useState } from 'react';
import { Skeleton } from '@wealthfolio/ui';
import { Card, CardContent, CardHeader, Icons } from '@wealthfolio/ui';
import { useBalancePrivacy } from '@wealthfolio/ui';
import type { AddonContext } from '@wealthfolio/addon-sdk';

// Simple ApplicationShell replacement since it's not exported from UI package
function ApplicationShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-h-screen bg-background ${className || ''}`}>
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}

// Simple EmptyPlaceholder component since it's not exported from UI package
function EmptyPlaceholder({ 
  className, 
  icon, 
  title, 
  description 
}: { 
  className?: string; 
  icon: React.ReactNode; 
  title: string; 
  description: string; 
}) {
  return (
    <div className={`flex min-h-[400px] flex-col items-center justify-center rounded-md border border-dashed p-8 text-center ${className || ''}`}>
      <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-4">
          {icon}
        </div>
        <h2 className="mt-2 text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-center text-sm font-normal leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
import { 
  FeePeriodSelector, 
  FeeOverviewCards, 
  FeeHistoryChart, 
  AccountBreakdown
} from '../components';
import { useFeeSummary, useFeeAnalytics } from '../hooks';

interface FeesPageProps {
  ctx: AddonContext;
}

export default function FeesPage({ ctx }: FeesPageProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<'TOTAL' | 'YTD' | 'LAST_YEAR'>('YTD');

  const {
    data: feeData,
    isLoading: isLoadingFees,
    error: feeError,
  } = useFeeSummary({ ctx });

  const {
    data: analyticsData,
    isLoading: isLoadingAnalytics,
    error: analyticsError,
  } = useFeeAnalytics({ ctx, period: selectedPeriod });

  const { isBalanceHidden } = useBalancePrivacy();

  if (isLoadingFees || isLoadingAnalytics) {
    return <FeesDashboardSkeleton />;
  }

  if (feeError) {
    ctx.api.logger.error('Fee data error: ' + feeError.message);
  }
  if (analyticsError) {
    ctx.api.logger.error('Analytics data error: ' + analyticsError.message);
  }

  if (feeError || analyticsError || !feeData || !analyticsData) {
    return (
      <ApplicationShell className="p-6">
        <div className="flex h-[calc(100vh-200px)] items-center justify-center">
          <EmptyPlaceholder
            className="mx-auto flex max-w-[420px] items-center justify-center"
            icon={<Icons.CreditCard className="h-10 w-10" />}
            title="Failed to load fee data"
            description={`Unable to load fee information: ${feeError?.message || analyticsError?.message || 'Unknown error'}`}
          />
        </div>
      </ApplicationShell>
    );
  }

  const periodSummary = feeData.find((summary) => summary.period === selectedPeriod);
  const totalSummary = feeData.find((summary) => summary.period === 'TOTAL');

  if (!periodSummary || !totalSummary) {
    return (
      <ApplicationShell className="p-6">
        <div className="flex h-[calc(100vh-200px)] items-center justify-center">
          <EmptyPlaceholder
            className="mx-auto flex max-w-[420px] items-center justify-center"
            icon={<Icons.CreditCard className="h-10 w-10" />}
            title="No fee data available"
            description="There is no fee data for the selected period. Try selecting a different time range or check back later."
          />
        </div>
      </ApplicationShell>
    );
  }

  // Prepare monthly fee data for chart
  const monthlyFeeData: [string, number][] = Object.entries(periodSummary.byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(selectedPeriod === 'TOTAL' ? -12 : 0) // Show last 12 months for TOTAL
    .map(([month, fees]) => [month, Number(fees) || 0]);

  // Get previous period data for comparison
  const getPreviousPeriodData = (currentMonth: string): number => {
    const [year, month] = currentMonth.split('-');
    const previousYear = parseInt(year) - 1;
    
    if (selectedPeriod === 'YTD') {
      return totalSummary.byMonth[`${previousYear}-${month}`] || 0;
    } else if (selectedPeriod === 'LAST_YEAR') {
      // For last year, compare with two years ago
      const twoYearsAgo = previousYear - 1;
      return totalSummary.byMonth[`${twoYearsAgo}-${month}`] || 0;
    }
    
    // For TOTAL, compare with previous year's same month
    return totalSummary.byMonth[`${previousYear}-${month}`] || 0;
  };

  const previousMonthlyFeeData: [string, number][] = monthlyFeeData.map(([month]) => [
    month,
    getPreviousPeriodData(month),
  ]);

  return (
    <ApplicationShell className="p-6">
      <div className="flex items-center justify-between pb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Investment Fees Tracker</h1>
          <p className="text-muted-foreground text-sm">
            Track and analyze your investment fees and their impact on returns
          </p>
        </div>
        <FeePeriodSelector
          selectedPeriod={selectedPeriod}
          onPeriodSelect={setSelectedPeriod}
        />
      </div>

      <div className="space-y-6">
        {/* Overview Cards */}
        <FeeOverviewCards 
          feeSummary={periodSummary}
          feeAnalytics={analyticsData}
          isBalanceHidden={isBalanceHidden}
        />

        {/* Charts Section */}
        <div className="grid gap-6 md:grid-cols-3">
          <FeeHistoryChart
            monthlyFeeData={monthlyFeeData}
            previousMonthlyFeeData={previousMonthlyFeeData}
            selectedPeriod={selectedPeriod}
            currency={periodSummary.currency}
            isBalanceHidden={isBalanceHidden}
          />
          
          <AccountBreakdown
            feeAnalytics={analyticsData}
            currency={periodSummary.currency}
            isBalanceHidden={isBalanceHidden}
          />
        </div>


      </div>
    </ApplicationShell>
  );
}

function FeesDashboardSkeleton() {
  return (
    <ApplicationShell className="p-6">
      <div className="flex items-center justify-between pb-6">
        <div>
          <Skeleton className="h-9 w-[300px]" />
          <Skeleton className="mt-2 h-5 w-[400px]" />
        </div>
        <Skeleton className="h-10 w-[200px]" />
      </div>
      
      <div className="space-y-6">
        {/* Overview Cards Skeleton */}
        <div className="grid gap-6 md:grid-cols-3">
          {[...Array(3)].map((_, index) => (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-[120px]" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-[150px]" />
                <Skeleton className="mt-2 h-4 w-[100px]" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Skeleton */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <Skeleton className="h-6 w-[200px]" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-[150px]" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[...Array(5)].map((_, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-[120px]" />
                    <Skeleton className="h-4 w-[80px]" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>


      </div>
    </ApplicationShell>
  );
}
