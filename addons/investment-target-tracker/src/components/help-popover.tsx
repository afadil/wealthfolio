import { Popover, PopoverContent, PopoverTrigger, Button, Icons } from '@wealthfolio/ui';

// Help popover component using design system
function HelpPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
        >
          <Icons.HelpCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">How It Works</h4>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                • Select a goal from your saved goals or track a custom target
              </p>
              <p>
                • Each dot represents your chosen step amount towards your investment target
              </p>
              <p>
                • Green dots show completed milestones based on your current portfolio value
              </p>
              <p>
                • The partially filled dot shows your progress within the current milestone
              </p>
              <p>
                • Click any dot to see the target amount for that milestone
              </p>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { HelpPopover };
