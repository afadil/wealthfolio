import { useState } from "react";

interface TargetPercentInputProps {
  value: number;
  onSave: (newValue: number) => Promise<void>;
  disabled?: boolean;
}

export function TargetPercentInput({ value, onSave, disabled = false }: TargetPercentInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.toFixed(1));
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (input: string) => {
    // Sanitize: only numbers and decimal point
    const sanitized = input.replace(/[^0-9.]/g, "");
    // Remove leading zeros
    const cleaned = sanitized.replace(/^0+(?=\d)/, "");
    setEditValue(cleaned || "0");
  };

  const handleBlur = async () => {
    const numValue = parseFloat(editValue) || 0;
    const clamped = Math.max(0, Math.min(100, numValue));

    setIsSaving(true);
    try {
      await onSave(clamped);
      setEditValue(clamped.toFixed(1));
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to save target:", err);
      setEditValue(value.toFixed(1));
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleBlur();
    if (e.key === "Escape") {
      setEditValue(value.toFixed(1));
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        type="text"
        value={editValue}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoFocus
        disabled={disabled || isSaving}
        className="border-primary bg-background text-foreground w-20 rounded border px-2 py-1 text-right font-semibold"
        placeholder="0"
      />
    );
  }

  return (
    <span
      onClick={() => !disabled && setIsEditing(true)}
      className={`cursor-pointer font-semibold ${
        disabled ? "cursor-not-allowed opacity-50" : "hover:text-primary transition-colors"
      }`}
    >
      {value.toFixed(1)}%
    </span>
  );
}
