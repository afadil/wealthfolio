import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Icons } from '../ui/icons';

interface AlertFeedbackProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  variant?: 'success' | 'error' | 'warning';
}

export function AlertFeedback({
  title,
  children,
  variant,
  className,
  ...props
}: AlertFeedbackProps) {
  let alertIcon;

  switch (variant) {
    case 'success':
      alertIcon = <Icons.CheckCircle className="h-4 w-4" />;
      break;
    case 'warning':
      alertIcon = <Icons.AlertTriangle className="h-4 w-4" />;
      break;
    case 'error':
    default:
      alertIcon = <Icons.AlertCircle className="h-4 w-4" />;
  }

  return (
    <Alert variant={variant} className={className} {...props}>
      {alertIcon}
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
