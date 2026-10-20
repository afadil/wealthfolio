import { cn } from "../../lib/utils";
import { Icons } from "./icons";

// shadcn's Spinner on our Loader2 icon. It is decorative by default, like the
// icons it replaces: the app is translated, so a caller that wants it announced
// passes a translated aria-label, which also makes it a status.
function Spinner({ className, "aria-label": ariaLabel, ...props }: React.ComponentProps<"svg">) {
  return (
    <Icons.Spinner
      data-slot="spinner"
      role={ariaLabel ? "status" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
