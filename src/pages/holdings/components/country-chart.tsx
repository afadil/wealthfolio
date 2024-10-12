import { useMemo, useState } from 'react';
import { Holding } from '@/lib/types';
import { CustomPieChart } from '@/components/custom-pie-chart';

interface CountryChartProps {
  holdings: Holding[];
}

export const CountryChart = ({ holdings }: CountryChartProps) => {
  const [activeIndex, setActiveIndex] = useState(1);

  const data = useMemo(() => {
    const countryMap = new Map<string, number>();
    holdings.forEach((holding) => {
      if (holding.countries && holding.countries.length > 0) {
        holding.countries.forEach((country) => {
          const currentValue = countryMap.get(country.code) || 0;
          const weightedValue = (holding.marketValueConverted * country.weight) / 100;
          countryMap.set(country.code, currentValue + weightedValue);
        });
      }
    });

    return Array.from(countryMap, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10); // Show top 10 countries
  }, [holdings]);

  const onPieEnter = (_: React.MouseEvent, index: number) => {
    setActiveIndex(index);
  };

  const onPieLeave = () => {};

  return (
    <CustomPieChart
      data={data}
      activeIndex={activeIndex}
      onPieEnter={onPieEnter}
      onPieLeave={onPieLeave}
    />
  );
};
