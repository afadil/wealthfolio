import { Icons } from '@/components/icons';

interface Step {
  id: number;
  title: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
}

export const StepIndicator = ({ steps, currentStep }: StepIndicatorProps) => {
  return (
    <div className="flex w-full items-center justify-center">
      {steps.map((step, index) => {
        const isCompleted = step.id < currentStep;
        const isCurrent = step.id === currentStep;
        const isLast = index === steps.length - 1;

        return (
          <div key={step.id} className="flex items-center">
            {/* Step circle */}
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                isCompleted
                  ? 'border-primary bg-primary text-primary-foreground'
                  : isCurrent
                    ? 'border-primary text-primary'
                    : 'border-muted-foreground/30 text-muted-foreground'
              }`}
            >
              {isCompleted ? (
                <Icons.Check className="h-4 w-4" />
              ) : (
                <span className="text-sm font-medium">{step.id}</span>
              )}
            </div>

            {/* Step title */}
            <span
              className={`ml-2 text-sm font-medium ${
                isCurrent
                  ? 'text-primary'
                  : isCompleted
                    ? 'text-foreground'
                    : 'text-muted-foreground'
              }`}
            >
              {step.title}
            </span>

            {/* Connector line */}
            {!isLast && (
              <div
                className={`mx-2 h-[2px] min-w-[2rem] flex-1 md:min-w-[4rem] ${
                  isCompleted ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
