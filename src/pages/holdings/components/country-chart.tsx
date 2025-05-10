import { useMemo, useState } from 'react';
import { Holding, Country } from '@/lib/types';
import { CustomPieChart } from '@/components/custom-pie-chart';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyPlaceholder } from '@/components/ui/empty-placeholder';

interface CountryChartProps {
  holdings?: Holding[];
  isLoading?: boolean;
  onCountrySectionClick?: (countryName: string) => void;
}

export const CountryChart = ({ holdings, isLoading, onCountrySectionClick }: CountryChartProps) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const data = useMemo(() => {
    if (!holdings) return [];
    const countryMap = new Map<string, number>();
    holdings.forEach((holding) => {
      const countries = holding.instrument?.countries;
      const marketValue = Number(holding.marketValue?.base) || 0;

      if (countries && countries.length > 0 && !isNaN(marketValue)) {
        countries.forEach((country: Country) => {
          const currentValue = countryMap.get(country.name) || 0;
          const weight = Number(country.weight) || 0;
          const weightedValue =
            marketValue * (weight > 1 ? weight / 100 : weight);
          countryMap.set(country.name, currentValue + weightedValue);
        });
      }
    });

    return Array.from(countryMap, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10); // Show top 10 countries
  }, [holdings]);

  if (isLoading) {
    return (
      <Card className="overflow-hidden backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-[180px]" />
            <Skeleton className="h-5 w-[80px]" />
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex h-[200px] items-center justify-center">
            <Skeleton className="h-[150px] w-[150px] rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const onPieEnter = (_: React.MouseEvent, index: number) => {
    setActiveIndex(index);
  };

  const handleInternalSectionClick = (sectionData: { name: string; value: number }) => {
    if (onCountrySectionClick) {
      onCountrySectionClick(sectionData.name);
    }
    const clickedIndex = data.findIndex(d => d.name === sectionData.name);
    if (clickedIndex !== -1) {
        setActiveIndex(clickedIndex);
    }
  };

  return (
    <Card className="overflow-hidden backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Country Allocation
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {data.length > 0 ? (
          <CustomPieChart
            data={data}
            activeIndex={activeIndex}
            onPieEnter={onPieEnter}
            onSectionClick={handleInternalSectionClick}
            startAngle={180}
            endAngle={0}
            displayTooltip={false}
          />
        ) : (
          <EmptyPlaceholder
            description="There is no country data available for your holdings."
            className="max-h-[160px]"
          />
        )}
      </CardContent>
    </Card>
  );
};
