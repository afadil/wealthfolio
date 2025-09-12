import { Icons } from "@/components/ui/icons";
import { motion } from "framer-motion";

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
    <div className="w-full">
      {/* Mobile: compact, scrollable rail with current title */}
      <div className="md:hidden">
        <div className="flex items-center gap-2 overflow-x-auto px-1 py-2">
          {steps.map((step, index) => {
            const isCompleted = step.id < currentStep;
            const isCurrent = step.id === currentStep;
            const isLast = index === steps.length - 1;

            return (
              <div key={`m-${step.id}`} className="flex items-center">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0.8 }}
                  animate={{
                    scale: isCurrent ? 1.1 : 1,
                    opacity: 1,
                  }}
                  transition={{ type: "spring", stiffness: 400, damping: 20, duration: 0.25 }}
                  className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
                    isCompleted
                      ? "border-primary bg-primary text-primary-foreground"
                      : isCurrent
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-muted-foreground/30 text-muted-foreground"
                  }`}
                >
                  {isCompleted ? (
                    <Icons.Check className="h-3.5 w-3.5" />
                  ) : (
                    <span className="text-xs font-medium">{step.id}</span>
                  )}
                </motion.div>

                {!isLast && (
                  <div className="bg-muted-foreground/30 relative mx-1 h-[2px] w-6 overflow-hidden">
                    <motion.div
                      initial={{ width: "0%" }}
                      animate={{ width: isCompleted ? "100%" : "0%" }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="bg-primary absolute inset-0 h-full"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="text-foreground px-2 pb-2 text-center text-sm font-medium">
          {steps[currentStep - 1]?.title}
        </div>
      </div>

      {/* Desktop and tablets: full stepper */}
      <div className="hidden w-full items-center justify-center md:flex">
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
                  boxShadow: isCurrent ? "0 0 0 4px rgba(var(--primary), 0.15)" : "none",
                }}
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 400, damping: 20, duration: 0.3 }}
                className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                  isCompleted
                    ? "border-primary bg-primary text-primary-foreground"
                    : isCurrent
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-muted-foreground/30 text-muted-foreground"
                }`}
              >
                {isCompleted ? (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", damping: 15 }}
                  >
                    <Icons.Check className="h-4 w-4" />
                  </motion.div>
                ) : (
                  <motion.span
                    key={`number-${step.id}`}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", damping: 15 }}
                    className="text-sm font-medium"
                  >
                    {step.id}
                  </motion.span>
                )}
              </motion.div>

              {/* Step title */}
              <motion.span
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0, fontWeight: isCurrent ? 600 : 500 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className={`ml-3 text-sm ${isCurrent ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"}`}
              >
                {step.title}
              </motion.span>

              {/* Connector line */}
              {!isLast && (
                <div className="bg-muted-foreground/30 relative mx-2 h-[2px] min-w-8 flex-1 overflow-hidden md:min-w-16">
                  <motion.div
                    initial={{ width: "0%" }}
                    animate={{ width: isCompleted ? "100%" : "0%" }}
                    transition={{ duration: 0.4, ease: "easeInOut", delay: 0.1 }}
                    className="bg-primary absolute inset-0 h-full"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
