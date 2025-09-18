import type React from "react";
import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// Main app routes for swipeable navigation
const routes = ["/dashboard", "/holdings", "/performance", "/income", "/activities"];

interface SwipeableLayoutProps {
  children: React.ReactNode;
}

export function SwipeableLayout({ children }: SwipeableLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [startX, setStartX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const currentIndex = routes.indexOf(location.pathname);

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;

    const currentX = e.touches[0].clientX;
    const diffX = startX - currentX;

    // Add visual feedback during swipe
    if (containerRef.current) {
      containerRef.current.style.transform = `translateX(${-diffX * 0.3}px)`;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isDragging) return;

    const endX = e.changedTouches[0].clientX;
    const diffX = startX - endX;
    const threshold = 50;

    // Reset transform
    if (containerRef.current) {
      containerRef.current.style.transform = "translateX(0)";
    }

    if (Math.abs(diffX) > threshold) {
      if (diffX > 0 && currentIndex < routes.length - 1) {
        // Swipe left - go to next page
        navigate(routes[currentIndex + 1]);
      } else if (diffX < 0 && currentIndex > 0) {
        // Swipe right - go to previous page
        navigate(routes[currentIndex - 1]);
      }
    }

    setIsDragging(false);
  };

  return (
    <div
      ref={containerRef}
      className="min-h-screen pb-20 transition-transform duration-200 ease-out"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {children}
    </div>
  );
}
