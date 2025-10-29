"use client";

import React, { useCallback, useState } from "react";
import { LiquidGlass } from "./liquid-glass";

interface LiquidButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "xl";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  style?: React.CSSProperties;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  rippleEffect?: boolean;
}

export function LiquidButton({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  className = "",
  style,
  icon,
  iconPosition = "left",
  rippleEffect = true,
}: LiquidButtonProps) {
  const [isPressed, setIsPressed] = useState(false);

  const getVariantStyles = () => {
    switch (variant) {
      case "primary":
        return "text-white bg-gradient-to-r from-blue-500/20 to-purple-600/20 border-blue-400/30 hover:from-blue-400/30 hover:to-purple-500/30";
      case "secondary":
        return "text-gray-100 bg-white/10 border-white/20 hover:bg-white/15";
      case "ghost":
        return "text-white bg-transparent border-white/10 hover:bg-white/5";
      case "danger":
        return "text-white bg-gradient-to-r from-red-500/20 to-pink-600/20 border-red-400/30 hover:from-red-400/30 hover:to-pink-500/30";
      default:
        return "text-white bg-white/10 border-white/20";
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case "sm":
        return "px-4 py-2 text-sm rounded-xl";
      case "lg":
        return "px-8 py-4 text-lg rounded-2xl";
      case "xl":
        return "px-10 py-5 text-xl rounded-3xl";
      default:
        return "px-6 py-3 text-base rounded-2xl";
    }
  };

  const handleClick = useCallback(() => {
    if (disabled || loading) return;

    setIsPressed(false);
    onClick?.();
  }, [disabled, loading, onClick]);

  const buttonContent = (
    <div className="flex items-center justify-center gap-2">
      {loading && (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      )}
      {icon && iconPosition === "left" && !loading && <span className="flex-shrink-0">{icon}</span>}
      <span className={loading ? "opacity-70" : ""}>{children}</span>
      {icon && iconPosition === "right" && !loading && (
        <span className="flex-shrink-0">{icon}</span>
      )}
    </div>
  );

  return (
    <LiquidGlass
      variant="button"
      intensity="medium"
      rippleEffect={rippleEffect}
      flowOnHover={!disabled}
      stretchOnDrag={!disabled}
      onClick={handleClick}
      className={` ${getVariantStyles()} ${getSizeStyles()} ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${isPressed ? "scale-95" : ""} font-medium backdrop-blur-3xl transition-all duration-150 ease-out select-none ${className} `}
      style={style}
    >
      {buttonContent}
    </LiquidGlass>
  );
}
