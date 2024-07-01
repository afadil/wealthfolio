import { getGoals, getGoalsAllocation } from '@/commands/goal';
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { calculateGoalProgress } from '@/lib/portfolio-helper';
import { AccountTotal, Goal, GoalAllocation, GoalProgress } from '@/lib/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useQuery } from '@tanstack/react-query';
import { formatAmount, formatPercent } from '@/lib/utils';
import { Icons } from '@/components/icons';

export function SavingGoals({ accounts }: { accounts?: AccountTotal[] }) {
  const { data: goals } = useQuery<Goal[], Error>({
    queryKey: ['goals'],
    queryFn: getGoals,
  });

  const { data: allocations } = useQuery<GoalAllocation[], Error>({
    queryKey: ['goals_allocations'],
    queryFn: getGoalsAllocation,
  });

  if (accounts === undefined || goals === undefined || allocations === undefined) return null;

  const goalsProgess = calculateGoalProgress(accounts, goals, allocations);

  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-4">
        <Card className="w-full border-0 bg-transparent shadow-none">
          <CardHeader className="py-2">
            <CardTitle className="text-md">Saving Goals</CardTitle>
          </CardHeader>
          <CardContent>
            <Card className="w-full">
              <CardContent className="pt-6">
                {goalsProgess?.map((goal: GoalProgress, index) => (
                  <Tooltip key={index}>
                    <TooltipTrigger asChild>
                      <div className="mb-4  cursor-help items-center">
                        <CardDescription className="mb-2 flex items-center text-sm font-light text-muted-foreground">
                          {goal.name}
                          {goal.progress >= 100 ? (
                            <Icons.CheckCircle className="ml-1 h-4 w-4 text-green-500" />
                          ) : null}
                        </CardDescription>

                        <Progress value={goal.progress} className=" h-2 w-full" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="space-y-2">
                      <h3 className="text-md font-bold text-muted-foreground">{goal.name}</h3>
                      <ul className="list-inside list-disc text-xs">
                        <li>
                          Progress: <b>{formatPercent(goal.progress)}</b>
                        </li>
                        <li>
                          Current Value:{' '}
                          <b>{formatAmount(goal.currentValue, goal.currency, false)}</b>
                        </li>
                        <li>
                          Target Value:{' '}
                          <b>{formatAmount(goal.targetValue, goal.currency, false)}</b>
                        </li>
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

export default SavingGoals;
