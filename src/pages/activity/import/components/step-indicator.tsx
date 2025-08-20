import { Icons } from '@/components/ui/icons';
import { motion } from 'framer-motion';

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
            <motion.div
              initial={{ scale: 0.9, opacity: 0.8 }}
              animate={{ 
                scale: isCurrent ? 1.1 : 1, 
                opacity: 1,
                boxShadow: isCurrent ? '0 0 0 4px rgba(var(--primary), 0.15)' : 'none',
              }}
              whileHover={{ scale: 1.05 }}
              transition={{ 
                type: 'spring', 
                stiffness: 400, 
                damping: 20, 
                duration: 0.3 
              }}
              className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                isCompleted
                  ? 'border-primary bg-primary text-primary-foreground'
                  : isCurrent
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-muted-foreground/30 text-muted-foreground'
              }`}
            >
              {isCompleted ? (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', damping: 15 }}
                >
                  <Icons.Check className="h-4 w-4" />
                </motion.div>
              ) : (
                <motion.span 
                  key={`number-${step.id}`}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', damping: 15 }}
                  className="text-sm font-medium"
                >
                  {step.id}
                </motion.span>
              )}
            </motion.div>

            {/* Step title */}
            <motion.span
              initial={{ opacity: 0, y: 3 }}
              animate={{ 
                opacity: 1, 
                y: 0,
                fontWeight: isCurrent ? 600 : 500,
              }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className={`ml-3 text-sm ${
                isCurrent
                  ? 'text-primary'
                  : isCompleted
                    ? 'text-foreground'
                    : 'text-muted-foreground'
              }`}
            >
              {step.title}
            </motion.span>

            {/* Connector line */}
            {!isLast && (
              <div className="relative mx-2 h-[2px] min-w-[2rem] flex-1 overflow-hidden bg-muted-foreground/30 md:min-w-[4rem]">
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: isCompleted ? '100%' : '0%' }}
                  transition={{ 
                    duration: 0.4, 
                    ease: 'easeInOut',
                    delay: 0.1 
                  }}
                  className="absolute inset-0 h-full bg-primary"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
