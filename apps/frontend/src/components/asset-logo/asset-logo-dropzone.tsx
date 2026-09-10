import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { LOGO_ACCEPT } from "@/lib/normalize-logo-image";
import { cn } from "@/lib/utils";

interface AssetLogoDropzoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
  /** Rendered inside the circle once an image is chosen (the candidate avatar). */
  children?: ReactNode;
  className?: string;
}

/** Circular file picker + HTML5 drop target, sized like the avatar it will replace. */
export function AssetLogoDropzone({
  onFile,
  disabled = false,
  children,
  className,
}: AssetLogoDropzoneProps) {
  const { t } = useTranslation("asset");
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasImage = !!children;

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (disabled) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFile(file);
    // Allow re-selecting the same file after an error or "choose a different image".
    event.target.value = "";
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={t("logo.dropzone_cta")}
      data-testid="asset-logo-dropzone"
      onClick={openPicker}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPicker();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
      }}
      onDrop={handleDrop}
      className={cn(
        "focus-visible:ring-ring group relative flex size-20 shrink-0 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        hasImage
          ? "ring-primary ring-offset-background ring-2 ring-offset-2"
          : "border-2 border-dotted",
        !hasImage &&
          (isDragging
            ? "border-primary bg-primary/10 text-primary scale-105"
            : "border-muted-foreground/40 text-muted-foreground hover:border-muted-foreground hover:bg-muted/60"),
        hasImage && isDragging && "scale-105",
        disabled ? "cursor-default opacity-60" : "cursor-pointer",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={LOGO_ACCEPT}
        className="hidden"
        disabled={disabled}
        data-testid="asset-logo-file-input"
        onChange={handleInputChange}
      />
      {hasImage ? (
        <>
          {children}
          {/* Hover affordance: the circle stays the way to swap the image. */}
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <Icons.ImageUp className="size-5" />
          </span>
        </>
      ) : (
        <Icons.ImageUp className="size-7" />
      )}
    </div>
  );
}
