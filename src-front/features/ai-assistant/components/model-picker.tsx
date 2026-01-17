import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@wealthfolio/ui";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import type { FC } from "react";
import { useState } from "react";

import type { ModelCapabilities, MergedModel } from "../types";
import { useChatModel } from "../hooks/use-chat-model";

// Inline SVG icons for capabilities not in the main Icons set
const BrainIcon: FC<{ size?: number; className?: string }> = ({ size = 12, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
    <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
    <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
    <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
    <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
    <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
    <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
    <path d="M6 18a4 4 0 0 1-1.967-.516" />
    <path d="M19.967 17.484A4 4 0 0 1 18 18" />
  </svg>
);

const WrenchIcon: FC<{ size?: number; className?: string }> = ({ size = 12, className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

interface ModelCapabilityIconsProps {
  capabilities: ModelCapabilities;
  size?: number;
}

function ModelCapabilityIcons({ capabilities, size = 12 }: ModelCapabilityIconsProps) {
  const hasAny = capabilities.thinking || capabilities.vision || capabilities.tools;
  if (!hasAny) return null;

  return (
    <div className="flex items-center gap-0.5">
      {capabilities.thinking && <BrainIcon size={size} className="text-blue-500" />}
      {capabilities.vision && <Icons.Eye size={size} className="text-green-500" />}
      {capabilities.tools && <WrenchIcon size={size} className="text-purple-500" />}
    </div>
  );
}

export const ModelPicker: FC = () => {
  const [open, setOpen] = useState(false);
  const { isLoading, currentProvider, currentModelId, selectModel } = useChatModel();

  if (isLoading || !currentProvider) {
    return null;
  }

  const provider = currentProvider;
  const models: MergedModel[] = provider.models ?? [];
  const currentModel: MergedModel | undefined = models.find(
    (m: MergedModel) => m.id === currentModelId,
  );

  // Get display name for model (strip :latest for Ollama)
  const getDisplayName = (modelId: string): string => {
    if (provider.id === "ollama") {
      return modelId.replace(":latest", "");
    }
    return modelId;
  };

  const handleModelSelect = (modelId: string) => {
    void selectModel(provider.id, modelId);
    setOpen(false);
  };

  // If only one model, just show the name without dropdown
  if (models.length <= 1) {
    return (
      <div className="text-muted-foreground flex items-center gap-1.5 px-3 text-xs">
        <span>{currentModel ? getDisplayName(currentModel.id) : "No model"}</span>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground h-8 gap-1.5 px-3 text-xs font-normal"
          aria-label="Select model"
        >
          <span>{currentModel ? getDisplayName(currentModel.id) : "Select model"}</span>
          <Icons.ChevronDown className="size-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-62 p-1.5" align="start" sideOffset={8}>
        <Command>
          <CommandEmpty>No models available</CommandEmpty>
          <CommandGroup>
            {models.map((model: MergedModel) => {
              const isSelected = model.id === currentModelId;
              return (
                <CommandItem
                  key={model.id}
                  value={model.id}
                  onSelect={() => handleModelSelect(model.id)}
                  className={`flex cursor-pointer items-center justify-between gap-4 px-2 py-1.5 ${
                    isSelected ? "bg-accent" : ""
                  }`}
                >
                  <span>{getDisplayName(model.id)}</span>
                  {model.capabilities && (
                    <ModelCapabilityIcons capabilities={model.capabilities} size={12} />
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
