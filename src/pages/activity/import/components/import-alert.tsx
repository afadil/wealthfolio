import type React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icons, type Icon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type AlertVariant = "warning" | "success" | "destructive";
type AlertSize = "sm" | "lg" | "xl";

interface ImportAlertProps {
  variant: AlertVariant;
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  icon?: Icon;
  rightIcon?: Icon;
  size?: AlertSize;
  children?: React.ReactNode;
}

export function ImportAlert({
  variant,
  title,
  description,
  className,
  icon: CustomIcon,
  rightIcon: RightIcon,
  size = "lg",
  children,
}: ImportAlertProps) {
  // Default icons based on variant
  let Icon = CustomIcon;
  if (!Icon) {
    switch (variant) {
      case "success":
        Icon = Icons.CheckCircle;
        break;
      case "warning":
        Icon = Icons.AlertTriangle;
        break;
      case "destructive":
        Icon = Icons.AlertCircle;
        break;
    }
  }

  // Style variations based on variant
  const variantStyles = {
    success: {
      iconBg: "bg-success/20",
      iconColor: "text-success",
      borderColor: "border-success/10",
      bg: "bg-success/10",
      title: "text-success",
      description: "text-foreground/90",
      glow: "",
    },
    warning: {
      iconBg: "bg-warning/20",
      iconColor: "text-warning",
      borderColor: "border-warning/10",
      bg: "bg-warning/10",
      title: "text-warning",
      description: "text-foreground/90",
      glow: "",
    },
    destructive: {
      iconBg: "bg-destructive/20",
      iconColor: "text-destructive",
      borderColor: "border-destructive/10",
      bg: "bg-destructive/10",
      title: "text-destructive",
      description: "text-foreground/90",
      glow: "",
    },
  };

  // Size variations
  const sizeStyles = {
    sm: {
      padding: "p-3",
      iconSize: "h-4 w-4",
      iconPadding: "p-1.5",
      marginRight: "mr-3",
      titleText: "text-sm",
      descriptionText: "text-xs",
    },
    lg: {
      padding: "p-4",
      iconSize: "h-5 w-5",
      iconPadding: "p-2",
      marginRight: "mr-4",
      titleText: "text-base",
      descriptionText: "text-sm",
    },
    xl: {
      padding: "p-5",
      iconSize: "h-6 w-6",
      iconPadding: "p-2.5",
      marginRight: "mr-5",
      titleText: "text-lg",
      descriptionText: "text-base",
    },
  };

  const styles = variantStyles[variant];
  const sizeStyle = sizeStyles[size];

  // Animation variants
  const alertVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.4,
        ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
      },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      y: -10,
      transition: {
        duration: 0.3,
        ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
      },
    },
  } as const;

  const iconVariants = {
    hidden: { scale: 0.8, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: {
        delay: 0.1,
        duration: 0.4,
        type: "spring",
        stiffness: 200,
      },
    },
  } as const;

  const contentVariants = {
    hidden: { opacity: 0, x: -5 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        delay: 0.2,
        duration: 0.3,
      },
    },
  } as const;

  const rightIconVariants = {
    hidden: { scale: 0.8, opacity: 0 },
    visible: {
      scale: 1,
      opacity: 1,
      transition: {
        delay: 0.3,
        duration: 0.4,
        type: "spring",
        stiffness: 200,
      },
    },
  } as const;

  const glowVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: [0.4, 1, 0.4] as number[],
      transition: {
        delay: 0.3,
        duration: 2,
        repeat: Infinity,
        repeatType: "reverse" as const,
      },
    },
  };

  return (
    <AnimatePresence>
      <motion.div initial="hidden" animate="visible" exit="exit" variants={alertVariants}>
        <Alert
          variant="default"
          className={cn(
            "relative mb-6 overflow-hidden p-0 backdrop-blur-sm",
            styles.borderColor,
            styles.bg,
            styles.glow,
            "border transition-all duration-200",
            className,
          )}
        >
          <div className={cn("flex items-start", sizeStyle.padding)}>
            {Icon && (
              <motion.div
                className={cn("shrink-0 self-center", sizeStyle.marginRight)}
                variants={iconVariants}
              >
                <div
                  className={cn(
                    "flex items-center justify-center rounded-full transition-all",
                    sizeStyle.iconPadding,
                    styles.iconBg,
                    styles.iconColor,
                  )}
                >
                  <Icon className={sizeStyle.iconSize} strokeWidth={2.5} />
                </div>
              </motion.div>
            )}
            <motion.div className="flex-1" variants={contentVariants}>
              {title && (
                <AlertTitle className={cn("mb-0 font-medium", styles.title, sizeStyle.titleText)}>
                  {title}
                </AlertTitle>
              )}
              {description && (
                <AlertDescription className={cn(styles.description, sizeStyle.descriptionText)}>
                  {description}
                </AlertDescription>
              )}
              {children}
            </motion.div>
            {RightIcon && (
              <motion.div className="ml-4 shrink-0 self-center" variants={rightIconVariants}>
                <div
                  className={cn(
                    "flex items-center justify-center rounded-full opacity-80 transition-all",
                    sizeStyle.iconPadding,
                    styles.iconColor,
                  )}
                >
                  <RightIcon className={sizeStyle.iconSize} strokeWidth={2.5} />
                </div>
              </motion.div>
            )}
          </div>
          <motion.div className="pointer-events-none absolute inset-0" variants={glowVariants}>
            <div
              className={cn(
                "absolute -top-10 -right-10 h-32 w-32 rounded-full opacity-20 blur-2xl",
                styles.iconBg,
              )}
            />
            <div
              className={cn(
                "absolute -bottom-10 -left-10 h-24 w-24 rounded-full opacity-10 blur-xl",
                styles.iconBg,
              )}
            />
          </motion.div>
        </Alert>
      </motion.div>
    </AnimatePresence>
  );
}
