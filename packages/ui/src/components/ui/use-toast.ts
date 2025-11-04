import type { ReactNode } from "react";
import { toast as sonnerToast, type ExternalToast } from "sonner";

type ToastVariant = "default" | "success" | "destructive";

export interface ToastOptions extends Omit<ExternalToast, "description"> {
  title?: ReactNode;
  description?: ReactNode;
  variant?: ToastVariant;
}

function showToast({ title, description, variant = "default", ...rest }: ToastOptions) {
  const message = title ?? description ?? "";
  const options: ExternalToast = {
    ...rest,
    description: title ? description : undefined,
  };

  switch (variant) {
    case "success":
      return sonnerToast.success(message, options);
    case "destructive":
      return sonnerToast.error(message, options);
    default:
      return sonnerToast(message, options);
  }
}

type ToastCallable = (options: ToastOptions) => string | number;

type ToastApi = ToastCallable & {
  dismiss: typeof sonnerToast.dismiss;
  success: typeof sonnerToast.success;
  info: typeof sonnerToast.info;
  warning: typeof sonnerToast.warning;
  error: typeof sonnerToast.error;
  loading: typeof sonnerToast.loading;
  message: typeof sonnerToast.message;
  custom: typeof sonnerToast.custom;
  getHistory: typeof sonnerToast.getHistory;
  getToasts: typeof sonnerToast.getToasts;
};

export const toast = Object.assign(
  ((options: ToastOptions) => showToast(options)) as ToastCallable,
  {
    dismiss: sonnerToast.dismiss,
    success: sonnerToast.success,
    info: sonnerToast.info,
    warning: sonnerToast.warning,
    error: sonnerToast.error,
    loading: sonnerToast.loading,
    message: sonnerToast.message,
    custom: sonnerToast.custom,
    getHistory: sonnerToast.getHistory,
    getToasts: sonnerToast.getToasts,
  },
) as ToastApi;

export function useToast() {
  return {
    toast,
    dismiss: sonnerToast.dismiss,
  };
}
