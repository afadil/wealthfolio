import { useState } from 'react';
import { type Goal } from '@wealthfolio/addon-sdk';
import { 
  Button,
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  CommandEmpty,
  CommandGroup,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Icons
} from '@wealthfolio/ui';

// Goal selector component with searchable dropdown using design system
function GoalSelector({ 
  goals, 
  selectedGoal, 
  onGoalSelect 
}: { 
  goals: Goal[]; 
  selectedGoal: Goal | null; 
  onGoalSelect: (goal: Goal | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full sm:w-[200px] justify-between"
        >
          {selectedGoal ? selectedGoal.title : "Select a goal..."}
          <Icons.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full sm:w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search goals..." />
          <CommandList>
            <CommandEmpty>No goals found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="no-goal"
                onSelect={() => {
                  onGoalSelect(null);
                  setOpen(false);
                }}
              >
                <Icons.Check
                  className={`mr-2 h-4 w-4 ${
                    !selectedGoal ? "opacity-100" : "opacity-0"
                  }`}
                />
                <div className="flex flex-col">
                  <span className="text-muted-foreground">No goal selected</span>
                </div>
              </CommandItem>
              {goals.map((goal) => (
                <CommandItem
                  key={goal.id}
                  value={goal.title}
                  onSelect={() => {
                    onGoalSelect(goal);
                    setOpen(false);
                  }}
                >
                  <Icons.Check
                    className={`mr-2 h-4 w-4 ${
                      selectedGoal?.id === goal.id ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <div className="flex flex-col">
                    <span>{goal.title}</span>
                    <span className="text-xs text-muted-foreground">
                      Target: ${goal.targetAmount.toLocaleString()}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export { GoalSelector };
