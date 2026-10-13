import { AVATAR_ATLASES } from "./avatar-catalog";
import type { CSSProperties } from "react";
import { cn } from "@wealthfolio/ui/lib/utils";

import { LINE_PORTRAITS } from "./avatar-catalog";

export function LinePortraitAvatar({
  portrait,
  className,
}: {
  portrait: (typeof LINE_PORTRAITS)[number];
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox={`${portrait.x} ${portrait.y} 363 444`}
      preserveAspectRatio="none"
      className={cn(
        "profile-portrait mx-auto block aspect-square w-20 max-w-full overflow-hidden rounded-2xl",
        className,
      )}
      style={{ "--blink-delay": `${LINE_PORTRAITS.indexOf(portrait) * 0.03}s` } as CSSProperties}
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse") return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width;
        const y = (event.clientY - bounds.top) / bounds.height;
        event.currentTarget.style.setProperty("--pointer-x", `${(x - 0.5) * 6}px`);
        event.currentTarget.style.setProperty("--pointer-y", `${(y - 0.5) * 4}px`);
      }}
      onPointerLeave={(event) => {
        event.currentTarget.style.removeProperty("--pointer-x");
        event.currentTarget.style.removeProperty("--pointer-y");
      }}
    >
      <image href={AVATAR_ATLASES.line} width="1536" height="1024" />
      {portrait.eyes.map(([x, y], index) => (
        <g key={index} transform={`translate(${x}, ${y})`}>
          <g className="profile-line-eyes">
            <path
              d="M-16 0 Q0-17 16 0"
              fill="none"
              stroke="#242322"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <g className="profile-portrait-gaze">
              <g className="profile-portrait-pointer">
                <ellipse cx="0" cy="3" rx="6.5" ry="10" fill="#242322" />
              </g>
            </g>
          </g>
        </g>
      ))}
    </svg>
  );
}
