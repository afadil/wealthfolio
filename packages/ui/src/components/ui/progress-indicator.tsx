import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from "@/lib/utils";
import { Icons } from '@/components/ui/icons';

// Custom DialogContent without close button
const DialogContentWithoutClose = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContentWithoutClose.displayName = "DialogContentWithoutClose";

export interface ProgressIndicatorProps {
  isLoading?: boolean;
  open?: boolean;
  title?: string;
  description?: string;
  message?: string;
}

export function ProgressIndicator({
  isLoading = true,
  open,
  title = "Processing",
  description = "Please wait while we process your request. This may take a few moments.",
  message = "Processing...",
}: ProgressIndicatorProps) {
  const [elapsedTime, setElapsedTime] = useState(0);

  // Track elapsed time during import
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    if (isLoading) {
      timer = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedTime(0);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isLoading]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // The progress content
  const progressContent = (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-md">
        <div className="flex flex-col items-center text-center space-y-4">
          <motion.div 
            className="rounded-full bg-primary/10 p-4"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ 
              duration: 0.5,
              repeat: Number.POSITIVE_INFINITY,
              repeatType: "reverse",
              ease: "easeInOut" 
            }}
          >
            <Icons.Settings className="h-8 w-8 animate-spin text-orange-500" />
          </motion.div>
          <motion.h3 
            className="text-base font-medium"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            {message} {formatTime(elapsedTime)}
          </motion.h3>
        </div>

        <div className="mt-6">
          <div className="relative h-2.5">
            {/* Beautiful gradient progress bar */}
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary/30">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500"
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{
                  repeat: Number.POSITIVE_INFINITY,
                  duration: 2,
                  ease: 'easeInOut',
                }}
                style={{ width: '50%' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // If open prop is provided, render as a dialog
  if (open !== undefined) {
    return (
      <Dialog open={open}>
        <DialogContentWithoutClose 
          className="sm:max-w-md p-0 border-none bg-transparent shadow-none"
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            {description}
          </DialogDescription>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {progressContent}
          </motion.div>
        </DialogContentWithoutClose>
      </Dialog>
    );
  }

  // Otherwise, render directly
  return progressContent;
}
