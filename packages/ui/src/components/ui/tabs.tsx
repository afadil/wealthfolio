import * as TabsPrimitive from "@radix-ui/react-tabs";
import { motion } from "motion/react";
import * as React from "react";

import { cn } from "../../lib/utils";

interface TabsContextValue {
  activeValue?: string;
  indicatorId: string;
}

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined);

const Tabs = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ value: valueProp, defaultValue, onValueChange, ...props }, ref) => {
  const [internalValue, setInternalValue] = React.useState<string | undefined>(valueProp ?? defaultValue);
  const indicatorId = React.useId();

  const handleValueChange = React.useCallback(
    (nextValue: string) => {
      setInternalValue(nextValue);
      onValueChange?.(nextValue);
    },
    [onValueChange],
  );

  const activeValue = valueProp ?? internalValue;

  const rootProps: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> = {
    ...props,
    onValueChange: handleValueChange,
  };

  if (valueProp !== undefined) {
    rootProps.value = valueProp;
  } else if (defaultValue !== undefined) {
    rootProps.defaultValue = defaultValue;
  }

  return (
    <TabsContext.Provider value={{ activeValue, indicatorId }}>
      <TabsPrimitive.Root ref={ref} {...rootProps} />
    </TabsContext.Provider>
  );
});
Tabs.displayName = TabsPrimitive.Root.displayName;

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "bg-muted text-muted-foreground inline-flex h-10 items-center justify-center rounded-md p-1",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, value, ...props }, ref) => {
  const context = React.useContext(TabsContext);
  const isActive = context?.activeValue === value;
  const layoutId = context?.indicatorId ?? "tabs-trigger-indicator";

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      value={value}
      className={cn(
        "ring-offset-background focus-visible:ring-ring text-muted-foreground data-[state=active]:text-foreground relative inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        "isolate overflow-hidden",
        className,
      )}
      {...props}
    >
      {isActive && (
        <motion.span
          layout
          layoutId={layoutId}
          className="bg-background ring-border/40 pointer-events-none absolute inset-0 z-0 shadow-sm ring-1"
          style={{ borderRadius: "inherit" }}
          transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.6 }}
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </TabsPrimitive.Trigger>
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "ring-offset-background focus-visible:ring-ring mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
