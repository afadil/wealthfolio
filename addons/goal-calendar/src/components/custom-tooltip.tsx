import { useState, useRef, useEffect, ReactNode } from 'react';

interface CustomTooltipProps {
  children: ReactNode;
  content: ReactNode;
  className?: string;
}

export function CustomTooltip({ children, content, className = '' }: CustomTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const containerRect = triggerRef.current.closest('.p-3, .p-6')?.getBoundingClientRect() || { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
      
      let top = triggerRect.bottom + 8;
      let left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
      
      // Adjust if tooltip would go outside container
      if (left < containerRect.left + 8) {
        left = containerRect.left + 8;
      } else if (left + tooltipRect.width > containerRect.right - 8) {
        left = containerRect.right - tooltipRect.width - 8;
      }
      
      // If tooltip would go below container, show above trigger
      if (top + tooltipRect.height > containerRect.bottom - 8) {
        top = triggerRect.top - tooltipRect.height - 8;
      }
      
      setPosition({ top, left });
    }
  };

  useEffect(() => {
    if (isVisible) {
      updatePosition();
    }
  }, [isVisible]);

  const handleMouseEnter = () => {
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  const handleClick = () => {
    setIsVisible(!isVisible);
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        className="relative inline-block"
      >
        {children}
      </div>
      
      {isVisible && (
        <div
          ref={tooltipRef}
          className={`fixed z-50 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95 ${className}`}
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {content}
        </div>
      )}
    </>
  );
}
