import { InfoIcon } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"

interface HelpTooltipProps {
  content: React.ReactNode
}

export function HelpTooltip({ content }: HelpTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger className="ml-2 cursor-help">
          <InfoIcon className="h-4 w-4 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent>
          <div className="max-w-xs">{content}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
