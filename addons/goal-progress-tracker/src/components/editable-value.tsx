import { useState } from "react";
import { Button, Input, Icons } from "@wealthfolio/ui";

// Editable value component using design system
function EditableValue({
  value,
  onChange,
  type = "currency",
  min = 0,
  step = 1000,
}: {
  value: number;
  onChange: (value: number) => void;
  type?: "currency" | "number";
  min?: number;
  step?: number;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value.toString());

  const handleSave = () => {
    const numValue = parseFloat(tempValue);
    if (!isNaN(numValue) && numValue >= min) {
      onChange(numValue);
    } else {
      setTempValue(value.toString());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTempValue(value.toString());
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  const displayValue = type === "currency" ? `$${value.toLocaleString()}` : value.toLocaleString();

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onKeyDown={handleKeyDown}
          min={min}
          step={step}
          autoFocus
          className="w-32"
        />
        <Button onClick={handleSave} size="sm" variant="default" className="h-8 w-8 p-0">
          <Icons.Check className="h-4 w-4" />
        </Button>
        <Button onClick={handleCancel} size="sm" variant="destructive" className="h-8 w-8 p-0">
          <Icons.Close className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      onClick={() => setIsEditing(true)}
      className="h-auto justify-start p-2 py-0 text-xs font-normal"
    >
      <span>{displayValue}</span>
      <Icons.Pencil className="ml-2 h-3 w-3 opacity-50" />
    </Button>
  );
}

export { EditableValue };
