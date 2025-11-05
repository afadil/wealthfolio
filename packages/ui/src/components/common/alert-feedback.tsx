import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Icons } from "../ui/icons";

interface AlertFeedbackProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  variant?: "success" | "error" | "warning";
}

export function AlertFeedback({ title, children, variant = "error", className, ...props }: AlertFeedbackProps) {
  const getIcon = () => {
    switch (variant) {
      case "success":
        return <Icons.CheckCircle className="size-4" />;
      case "warning":
        return <Icons.AlertTriangle className="size-4" />;
      case "error":
        return <Icons.AlertCircle className="size-4" />;
      default:
        return <Icons.AlertCircle className="size-4" />;
    }
  };

  return (
    <Alert
      variant={variant}
      className={cn(
        "flex items-start gap-3 [&>div]:flex [&>div]:items-start [&>div]:gap-3 [&>svg]:static [&>svg]:shrink-0 [&>svg~*]:pl-0",
        className,
      )}
      {...props}
    >
      {getIcon()}
      <div className="flex-1 pt-[1px]">
        {title && <AlertTitle>{title}</AlertTitle>}
        <AlertDescription>{children}</AlertDescription>
      </div>
    </Alert>
  );
}
