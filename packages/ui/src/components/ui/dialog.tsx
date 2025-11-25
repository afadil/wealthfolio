"use client";

import { cn } from "@/lib/utils";
import * as React from "react";
import { Sheet, SheetContent } from "./sheet";
import {
  SimpleDialog,
  SimpleDialogClose,
  SimpleDialogContent,
  SimpleDialogDescription,
  SimpleDialogFooter,
  SimpleDialogHeader,
  SimpleDialogOverlay,
  SimpleDialogPortal,
  SimpleDialogTitle,
  SimpleDialogTrigger,
} from "./simple-dialog";

// Default mobile detection hook (can be overridden)
function defaultUseIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkViewport = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkViewport();
    window.addEventListener("resize", checkViewport);

    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  return isMobile;
}

// Context for passing mobile detection and open state
interface DialogContextValue {
  useIsMobile?: () => boolean;
  isMobile: boolean;
}

const DialogContext = React.createContext<DialogContextValue>({
  isMobile: false,
});

// Export all the simple components for direct use if needed
export const DialogTrigger = SimpleDialogTrigger;
export const DialogClose = SimpleDialogClose;
export const DialogPortal = SimpleDialogPortal;
export const DialogOverlay = SimpleDialogOverlay;
export const DialogHeader = SimpleDialogHeader;
export const DialogFooter = SimpleDialogFooter;
export const DialogTitle = SimpleDialogTitle;
export const DialogDescription = SimpleDialogDescription;

// Responsive Dialog that switches between Sheet and SimpleDialog at the root level
interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  /**
   * Custom hook to determine if mobile view
   */
  useIsMobile?: () => boolean;
}

export function Dialog({ open, onOpenChange, children, useIsMobile }: DialogProps) {
  const useIsMobileHook = useIsMobile || defaultUseIsMobile;
  const isMobile = useIsMobileHook();

  const contextValue = React.useMemo(() => ({ useIsMobile, isMobile }), [useIsMobile, isMobile]);

  if (isMobile) {
    return (
      <DialogContext.Provider value={contextValue}>
        <Sheet open={open} onOpenChange={onOpenChange}>
          {children}
        </Sheet>
      </DialogContext.Provider>
    );
  }

  return (
    <DialogContext.Provider value={contextValue}>
      <SimpleDialog open={open} onOpenChange={onOpenChange}>
        {children}
      </SimpleDialog>
    </DialogContext.Provider>
  );
}

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof SimpleDialogContent> {
  /**
   * Custom className for mobile sheet content
   */
  mobileClassName?: string;
  /**
   * Side to show the sheet from on mobile (default: "bottom")
   */
  side?: "top" | "bottom" | "left" | "right";
}

export const DialogContent = React.forwardRef<React.ElementRef<typeof SimpleDialogContent>, DialogContentProps>(
  (
    { children, className, mobileClassName = "h-[90vh] overflow-y-auto rounded-t-3xl", side = "bottom", ...props },
    ref,
  ) => {
    const context = React.useContext(DialogContext);
    const isMobile = context.isMobile;

    if (isMobile) {
      return (
        <SheetContent side={side} className={cn(mobileClassName, "mx-1 !rounded-t-4xl")}>
          {children}
        </SheetContent>
      );
    }

    return (
      <SimpleDialogContent ref={ref} className={className} {...props}>
        {children}
      </SimpleDialogContent>
    );
  },
);

DialogContent.displayName = "DialogContent";
