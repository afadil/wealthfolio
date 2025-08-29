import { Card } from '@/components/ui/card';
// import { formatAmount, formatPercent } from '@wealthfolio/ui';

import {
  RadialBarChart,
  RadialBar,
  Legend,
  ResponsiveContainer,
  LabelList,
  // Tooltip,
} from 'recharts';

const data = [
  {
    name: 'Emergency Fund',
    uv: 26.69,
    pv: 4567,
    fill: '#83a6ed',
  },
  {
    name: 'House Down Payment',
    uv: 15.69,
    pv: 1398,
    fill: '#8dd1e1',
  },
  {
    name: 'Children Education',
    uv: 8.22,
    pv: 9800,
    fill: '#82ca9d',
  },
  {
    name: 'Retirement',
    uv: 10,
    pv: 200,
    fill: '#000',
  },
];

// type CustomTooltipProps = {
//   active: boolean;
//   payload: { value: number; payload: any }[];
// };

// const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
//   if (active && payload && payload.length) {
//     const data = payload[0].payload;
//     return (
//       <Card className="p-4">
//         <CardTitle className="text-md font-bold text-muted-foreground">{data.name}</CardTitle>
//         <CardContent>
//           {/* <h3 className="text-md font-bold text-muted-foreground">{goal.name}</h3> */}
//           <ul className="list list-disc text-xs">
//             <li>
//               Progress: <b>{formatPercent(data.progress)}</b>
//             </li>
//             <li>
//               Current Value: <b>{formatAmount(data.currentValue, data.currency, false)}</b>
//             </li>
//             <li>
//               Target Value: <b>{formatAmount(data.targetValue, data.currency, false)}</b>
//             </li>
//           </ul>
//         </CardContent>
//       </Card>
//     );
//   }

//   return null;
// };

export function GoalsProgressChart() {
  return (
    <Card className="w-full">
      <ResponsiveContainer width="100%" height={400}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="10%"
          outerRadius="80%"
          barSize={12}
          data={data}
        >
          <RadialBar
            // minAngle={15}
            //label={{ position: 'insideStart', fill: '#000', fontSize: 9 }}
            // label="goal"
            background
            // clockWise
            isAnimationActive={true}
            dataKey="value"
            legendType="circle"
          >
            <LabelList dataKey="name" position="insideStart" angle={270} offset={25} fill="black" />
          </RadialBar>
          {/* <Tooltip content={<CustomTooltip  />} /> */}
          <Legend
            iconSize={10}
            layout="horizontal"
            align="left"
            className="text-xs text-muted-foreground"
          />
        </RadialBarChart>
      </ResponsiveContainer>
    </Card>
  );
}
