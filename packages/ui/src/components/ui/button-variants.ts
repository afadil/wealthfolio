import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap rounded-(--theme-button-radius,var(--theme-control-radius,9999px)) text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-(--destructive-control,var(--destructive)) text-(--destructive-control-foreground,white) hover:bg-(--destructive-control-hover,color-mix(in_oklab,var(--destructive)_90%,transparent)) focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-(--destructive-control,color-mix(in_oklab,var(--destructive)_60%,transparent)) dark:hover:bg-(--destructive-control-hover,color-mix(in_oklab,var(--destructive)_90%,transparent))",
        outline:
          "border border-input bg-input-bg shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-(--theme-control-height,2.75rem) max-sm:min-h-11 max-sm:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11 px-5 py-(--theme-control-padding,0.625rem) has-[>svg]:px-4",
        xs: "max-sm:min-h-11 max-sm:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11 h-8 gap-1 px-2.5 has-[>svg]:px-2",
        sm: "max-sm:min-h-11 max-sm:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11 h-9 gap-1.5 px-4 has-[>svg]:px-3",
        lg: "max-sm:min-h-11 max-sm:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11 h-11 px-7 has-[>svg]:px-5",
        icon: "max-sm:min-h-11 max-sm:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11 size-10",

        "icon-xs":
          "max-sm:min-h-11 max-sm:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11 size-8",
        "icon-sm":
          "max-sm:min-h-11 max-sm:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11 size-9",
        "icon-lg":
          "max-sm:min-h-11 max-sm:min-w-11 pointer-coarse:min-h-11 pointer-coarse:min-w-11 size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
