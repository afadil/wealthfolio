import { useIsMobileViewport } from "@/hooks";
import { useSettingsContext } from "@/lib/settings-provider";
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { settings } = useSettingsContext();
  const isMobile = useIsMobileViewport();
  const settingsTheme = settings?.theme;

  let theme: "light" | "dark" | "system" = "system";
  if (settingsTheme === "light") {
    theme = "light";
  } else if (settingsTheme === "dark") {
    theme = "dark";
  } else if (settingsTheme === "system") {
    theme = "system";
  }

  return (
    <Sonner
      theme={theme}
      position={isMobile ? "top-center" : undefined}
      className="toaster group"
      expand={true}
      richColors
      icons={{
        success: <CircleCheckIcon className="text-success size-4" />,
        info: <InfoIcon className="size-4 text-blue-500" />,
        warning: <TriangleAlertIcon className="text-warning size-4" />,
        error: <OctagonXIcon className="text-destructive size-4" />,
        loading: <Loader2Icon className="text-muted-foreground size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--toast-bg)",
          "--normal-text": "var(--toast-fg)",
          "--normal-border": "var(--toast-border)",
          "--border-radius": "var(--radius)",
          "--success-bg": "var(--toast-success-bg)",
          "--success-text": "var(--toast-success-fg)",
          "--success-border": "var(--toast-success-border)",
          "--error-bg": "var(--toast-error-bg)",
          "--error-text": "var(--toast-error-fg)",
          "--error-border": "var(--toast-error-border)",
          "--warning-bg": "var(--toast-warning-bg)",
          "--warning-text": "var(--toast-warning-fg)",
          "--warning-border": "var(--toast-warning-border)",
          "--info-bg": "var(--toast-info-bg)",
          "--info-text": "var(--toast-info-fg)",
          "--info-border": "var(--toast-info-border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
