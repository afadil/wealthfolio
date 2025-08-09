import { Button, Icons } from '@wealthfolio/ui';
import { useState, useRef, useEffect } from 'react';

// Help popover component using a simple tooltip approach without portals
function HelpPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const togglePopover = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        left: Math.max(8, rect.right - 400) // 400px is the width of our popover, 8px margin
      });
    }
    setIsOpen(!isOpen);
  };

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        buttonRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={togglePopover}
        aria-label="Help"
      >
        <Icons.HelpCircle className="h-4 w-4" />
      </Button>
      
      {isOpen && (
        <div
          ref={popoverRef}
          className="fixed z-50 w-96 rounded-md border bg-popover p-4 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
        >
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
        </div>
      )}
    </>
  );
}

export { HelpPopover };
