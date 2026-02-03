import { Button, Icons, Popover, PopoverContent, PopoverTrigger } from "@wealthfolio/ui";

// Help popover component using shadcn Popover
function HelpPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Help">
          <Icons.HelpCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-96" align="start">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">How It Works</h4>
            <div className="text-muted-foreground space-y-2 text-sm">
              <p>• Select a goal from your saved goals or track a custom target</p>
              <p>• Each dot represents your chosen step amount towards your investment target</p>
              <p>• Green dots show completed milestones based on your current portfolio value</p>
              <p>• The partially filled dot shows your progress within the current milestone</p>
              <p>• Click any dot to see the target amount for that milestone</p>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { HelpPopover };
