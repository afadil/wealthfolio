import { cn } from '@/lib/utils';

interface DriftGaugeProps {
  target: number;
  actual: number;
  drift: number;
  status: 'on-target' | 'underweight' | 'overweight';
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'on-target':
      return 'bg-green-500';
    case 'underweight':
      return 'bg-orange-500';
    case 'overweight':
      return 'bg-red-500';
    default:
      return 'bg-slate-500';
  }
}

function getStatusText(status: string): string {
  switch (status) {
    case 'on-target':
      return '✓ On Target';
    case 'underweight':
      return '⬇ Underweight';
    case 'overweight':
      return '⬆ Overweight';
    default:
      return status;
  }
}

export function DriftGauge({ target, actual, drift, status }: DriftGaugeProps) {
  const barWidth = Math.min(actual, 100);

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Target: {target.toFixed(1)}%</span>
        <span className="font-medium">Actual: {actual.toFixed(1)}%</span>
      </div>

      {/* Progress bar */}
      <div className="relative h-8 bg-secondary rounded overflow-hidden">
        {/* Target line */}
        <div
          className="absolute h-full w-0.5 bg-slate-400"
          style={{ left: `${Math.min(target, 100)}%` }}
          title={`Target: ${target}%`}
        />

        {/* Actual bar */}
        <div
          className={cn('h-full transition-all', getStatusColor(status))}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      {/* Status and drift */}
      <div className="flex justify-between text-xs">
        <span className={cn('font-medium', getStatusColor(status))}>
          {getStatusText(status)}
        </span>
        <span className="text-muted-foreground">
          Drift: {drift > 0 ? '+' : ''}{drift.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
