import type React from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import { AlertCircle, AlertTriangle, CheckCircle2, type LucideIcon } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

type AlertVariant = "warning" | "success" | "destructive"
type AlertSize = "sm" | "lg" | "xl"

interface ImportAlertProps {
  variant: AlertVariant
  title: React.ReactNode
  description?: React.ReactNode
  className?: string
  icon?: LucideIcon
  rightIcon?: LucideIcon
  size?: AlertSize
  children?: React.ReactNode
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
  let Icon = CustomIcon
  if (!Icon) {
    switch (variant) {
      case "success":
        Icon = CheckCircle2
        break
      case "warning":
        Icon = AlertTriangle
        break
      case "destructive":
        Icon = AlertCircle
        break
    }
  }

  // Style variations based on variant
  const variantStyles = {
    success: {
      iconBg: 'bg-success/20',
      iconColor: 'text-success',
      borderColor: 'border-success/10',
      bg: 'bg-success/10',
      title: 'text-success',
      description: 'text-foreground/90',
      glow: '',
    },
    warning: {
      iconBg: 'bg-warning/20',
      iconColor: 'text-warning',
      borderColor: 'border-warning/10',
      bg: 'bg-warning/10',
      title: 'text-warning',
      description: 'text-foreground/90',
      glow: '',
    },
    destructive: {
      iconBg: 'bg-destructive/20',
      iconColor: 'text-destructive',
      borderColor: 'border-destructive/10',
      bg: 'bg-destructive/10',
      title: 'text-destructive',
      description: 'text-foreground/90',
      glow: '',
    },
  };

  // Size variations
  const sizeStyles = {
    sm: {
      padding: 'p-3',
      iconSize: 'h-4 w-4',
      iconPadding: 'p-1.5',
      marginRight: 'mr-3',
      titleText: 'text-sm',
      descriptionText: 'text-xs',
    },
    lg: {
      padding: 'p-4',
      iconSize: 'h-5 w-5',
      iconPadding: 'p-2',
      marginRight: 'mr-4',
      titleText: 'text-base',
      descriptionText: 'text-sm',
    },
    xl: {
      padding: 'p-5',
      iconSize: 'h-6 w-6',
      iconPadding: 'p-2.5',
      marginRight: 'mr-5',
      titleText: 'text-lg',
      descriptionText: 'text-base',
    },
  };

  const styles = variantStyles[variant]
  const sizeStyle = sizeStyles[size]

  // Animation variants
  const alertVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: { 
        duration: 0.4,
        ease: [0.22, 1, 0.36, 1] 
      }
    },
    exit: { 
      opacity: 0, 
      scale: 0.95, 
      y: -10,
      transition: { 
        duration: 0.3,
        ease: [0.22, 1, 0.36, 1]
      }
    }
  }

  const iconVariants = {
    hidden: { scale: 0.8, opacity: 0 },
    visible: { 
      scale: 1, 
      opacity: 1,
      transition: { 
        delay: 0.1, 
        duration: 0.4,
        type: "spring",
        stiffness: 200
      }
    }
  }

  const contentVariants = {
    hidden: { opacity: 0, x: -5 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        delay: 0.2,
        duration: 0.3
      }
    }
  }

  const rightIconVariants = {
    hidden: { scale: 0.8, opacity: 0 },
    visible: { 
      scale: 1, 
      opacity: 1,
      transition: { 
        delay: 0.3, 
        duration: 0.4,
        type: "spring",
        stiffness: 200
      }
    }
  }

  const glowVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: [0.4, 1, 0.4],
      transition: {
        delay: 0.3,
        duration: 2,
        repeat: Infinity,
        repeatType: "reverse" as const
      }
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={alertVariants}
      >
        <Alert
          variant="default"
          className={cn(
            "mb-6 relative p-0 overflow-hidden backdrop-blur-sm",
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
                className={cn("flex-shrink-0 self-center", sizeStyle.marginRight)}
                variants={iconVariants}
              >
                <div className={cn(
                  "rounded-full flex items-center justify-center transition-all", 
                  sizeStyle.iconPadding,
                  styles.iconBg, 
                  styles.iconColor
                )}>
                  <Icon className={sizeStyle.iconSize} strokeWidth={2.5} />
                </div>
              </motion.div>
            )}
            <motion.div 
              className="flex-1" 
              variants={contentVariants}
            >
              {title && <AlertTitle className={cn("font-medium mb-0", styles.title, sizeStyle.titleText)}>{title}</AlertTitle>}
              {description && (
                <AlertDescription className={cn(styles.description, sizeStyle.descriptionText)}>{description}</AlertDescription>
              )}
              {children}
            </motion.div>
            {RightIcon && (
              <motion.div 
                className="ml-4 flex-shrink-0 self-center"
                variants={rightIconVariants}
              >
                <div className={cn(
                  "rounded-full flex items-center justify-center transition-all opacity-80", 
                  sizeStyle.iconPadding,
                  styles.iconColor

                )}>
                  <RightIcon className={sizeStyle.iconSize} strokeWidth={2.5} />
                </div>
              </motion.div>
            )}
          </div>
          <motion.div 
            className="absolute inset-0 pointer-events-none"
            variants={glowVariants}
          >
            <div className={cn("absolute -right-10 -top-10 w-32 h-32 rounded-full blur-2xl opacity-20", styles.iconBg)} />
            <div className={cn("absolute -left-10 -bottom-10 w-24 h-24 rounded-full blur-xl opacity-10", styles.iconBg)} />
          </motion.div>
        </Alert>
      </motion.div>
    </AnimatePresence>
  )
}

