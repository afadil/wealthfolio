import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "motion/react";
import { useState } from "react";

const animatedToggleVariants = cva("relative inline-flex items-center scrollbar-hide overflow-x-auto touch-pan-x", {
  variants: {
    variant: {
      default: "bg-muted",
      secondary: "bg-secondary",
    },
    size: {
      default: "gap-1 rounded-full p-1",
      xs: "gap-0.5 md:gap-0.5 rounded-full p-0.5",
      sm: "gap-0.5 rounded-full p-0.5",
      md: "gap-1 rounded-full p-1",
      lg: "gap-1.5 rounded-full p-1.5",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

const animatedToggleItemVariants = cva(
  "relative z-10 flex-shrink-0 font-medium transition-colors rounded-full cursor-pointer touch-manipulation select-none focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
  {
    variants: {
      size: {
        default: "px-6 py-2 text-sm",
        xs: "px-3.5 md:px-4 py-1.5 text-xs",
        sm: "px-5 py-2 text-xs",
        md: "px-7 py-2 text-sm",
        lg: "px-8 py-2.5 text-base",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

interface ToggleGroupItem<T extends string = string> {
  value: T;
  label: string;
  title?: string;
}

interface AnimatedToggleGroupProps<T extends string = string> extends VariantProps<typeof animatedToggleVariants> {
  items: ToggleGroupItem<T>[];
  defaultValue?: T;
  value?: T;
  onValueChange?: (value: T) => void;
  className?: string;
}

export function AnimatedToggleGroup<T extends string = string>(props: AnimatedToggleGroupProps<T>) {
  const { items, defaultValue, value: controlledValue, onValueChange, variant, size, className } = props;
  const [internalValue, setInternalValue] = useState<T | undefined>(defaultValue ?? items[0]?.value);

  const isControlled = controlledValue !== undefined;
  const selected = controlledValue ?? internalValue;

  const handleSelect = (value: T) => {
    if (!isControlled) {
      setInternalValue(value);
    }
    onValueChange?.(value);
  };

  return (
    <div className={cn(animatedToggleVariants({ variant, size }), className)}>
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => handleSelect(item.value)}
          title={item.title}
          className={cn(
            animatedToggleItemVariants({ size }),
            selected === item.value ? "text-foreground" : "text-foreground/90 hover:text-foreground/80",
          )}
          type="button"
        >
          {selected === item.value && (
            <motion.div
              layoutId="toggle-indicator"
              className="bg-background absolute inset-0 -z-10 rounded-full shadow-sm"
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 30,
              }}
            />
          )}
          {item.label}
        </button>
      ))}
    </div>
  );
}

export { animatedToggleItemVariants, animatedToggleVariants };
