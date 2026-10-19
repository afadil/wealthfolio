import * as React from "react";
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { toggleVariants } from "./toggle";

interface ToggleGroupOptions {
  spacing?: number;
  orientation?: "horizontal" | "vertical";
}

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants> & ToggleGroupOptions>({
  size: "default",
  variant: "default",
  spacing: 1,
  orientation: "horizontal",
});

interface ToggleGroupProps
  extends Omit<ToggleGroupPrimitive.Props, "className">, VariantProps<typeof toggleVariants>, ToggleGroupOptions {
  className?: string;
  /**
   * @deprecated Radix's API (`type` with a string value for "single"), kept so addons built against
   * earlier SDKs keep working. Use `multiple` and array values.
   */
  type?: "single" | "multiple";
}

// Radix's single-select group took and returned a string ("" when nothing was pressed).
function legacyToggleGroupProps(
  type: "single" | "multiple" | undefined,
  { value, defaultValue, onValueChange }: Pick<ToggleGroupPrimitive.Props, "value" | "defaultValue" | "onValueChange">,
): Partial<ToggleGroupPrimitive.Props> {
  if (type === "multiple") return { multiple: true };
  if (type !== "single") return {};
  const toArray = (v: unknown) => (typeof v === "string" ? (v ? [v] : []) : v);
  return {
    value: toArray(value) as ToggleGroupPrimitive.Props["value"],
    defaultValue: toArray(defaultValue) as ToggleGroupPrimitive.Props["defaultValue"],
    onValueChange: onValueChange
      ? (next, details) => (onValueChange as (value: unknown, details: unknown) => void)(next[0] ?? "", details)
      : undefined,
  };
}

// `spacing` is the gap in spacing steps (default 1, 4 px); 0 joins the items into one segmented control.
function ToggleGroup({
  className,
  variant,
  size,
  spacing = 1,
  orientation = "horizontal",
  type,
  children,
  ...props
}: ToggleGroupProps) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      orientation={orientation}
      style={{ "--gap": spacing } as React.CSSProperties}
      className={cn(
        "group/toggle-group data-vertical:flex-col data-vertical:items-stretch flex items-center justify-center gap-[--spacing(var(--gap))] data-[spacing=0]:data-[variant=outline]:rounded-md",
        className,
      )}
      {...props}
      {...legacyToggleGroupProps(type, props)}
    >
      <ToggleGroupContext.Provider value={{ variant, size, spacing, orientation }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  );
}

interface ToggleGroupItemProps extends Omit<TogglePrimitive.Props, "className">, VariantProps<typeof toggleVariants> {
  className?: string;
}

function ToggleGroupItem({ className, children, variant, size, ...props }: ToggleGroupItemProps) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        "group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-s-0 group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-s-md group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-md group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-s group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-e-md group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-md shrink-0 focus:z-10 focus-visible:z-10 group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:shadow-none",
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        className,
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  );
}

export { ToggleGroup, ToggleGroupItem };
