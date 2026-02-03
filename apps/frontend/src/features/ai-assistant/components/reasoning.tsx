"use client";

import { memo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect } from "react";

import { Icons } from "@wealthfolio/ui/components/ui/icons";

import {
  useAssistantState,
  useMessagePartReasoning,
  type ReasoningGroupComponent,
  type ReasoningMessagePartComponent,
} from "@assistant-ui/react";

const CONTENT_HEIGHT = 160; // px - fixed height for content area

/**
 * Renders a single reasoning part's text.
 * Consecutive reasoning parts are automatically grouped by ReasoningGroup.
 */
const ReasoningImpl: ReasoningMessagePartComponent = () => {
  const { text } = useMessagePartReasoning();
  return <p className="whitespace-pre-wrap">{text}</p>;
};

/**
 * Collapsible wrapper that groups consecutive reasoning parts together.
 * Streams content naturally like regular messages.
 */
const ReasoningGroupImpl: ReasoningGroupComponent = ({ children, startIndex, endIndex }) => {
  const [isExpanded, setIsExpanded] = useState(false); // Start collapsed
  const contentRef = useRef<HTMLDivElement>(null);

  /**
   * Detects if reasoning is currently streaming within this group's range.
   */
  const isThinking = useAssistantState(({ message }) => {
    if (message.status?.type !== "running") return false;
    const lastIndex = message.parts.length - 1;
    if (lastIndex < 0) return false;
    const lastType = message.parts[lastIndex]?.type;
    if (lastType !== "reasoning") return false;
    return lastIndex >= startIndex && lastIndex <= endIndex;
  });

  /**
   * Get the reasoning text length to trigger scroll on content change.
   */
  const reasoningLength = useAssistantState(({ message }) => {
    return message.parts
      .slice(startIndex, endIndex + 1)
      .filter((part) => part.type === "reasoning")
      .reduce((acc, part) => acc + ("text" in part ? part.text.length : 0), 0);
  });

  const hasFinishedThinking = !isThinking;

  // Smooth auto-scroll to bottom while streaming
  useEffect(() => {
    if (!hasFinishedThinking && contentRef.current) {
      contentRef.current.scrollTo({
        top: contentRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [reasoningLength, hasFinishedThinking]);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const headerText = "Thinking";

  return (
    <motion.div
      className="bg-muted/50 mb-4 flex w-full flex-col overflow-hidden rounded-xl"
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header */}
      <div
        className="hover:bg-muted/80 flex cursor-pointer select-none items-center justify-between px-3 py-2 transition-colors"
        onClick={toggleExpanded}
      >
        <div className="flex items-center gap-2">
          <Icons.Brain
            className={`size-4 ${!hasFinishedThinking ? "shimmer text-muted-foreground" : "text-muted-foreground"}`}
          />
          <span
            className={`text-sm ${!hasFinishedThinking ? "shimmer text-muted-foreground" : "text-muted-foreground"}`}
          >
            {headerText}
          </span>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-muted-foreground"
        >
          <Icons.ChevronDown className="size-4" />
        </motion.div>
      </div>

      {/* Content Area */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: CONTENT_HEIGHT, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative"
          >
            <div
              ref={contentRef}
              className="text-muted-foreground h-full overflow-y-auto px-3 pb-6 text-xs leading-relaxed"
              style={{ height: CONTENT_HEIGHT }}
            >
              {children}
            </div>
            {/* Bottom fade gradient */}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
              style={{
                background: "linear-gradient(to top, hsl(var(--muted) / 0.5), transparent)",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export const Reasoning = memo(ReasoningImpl);
Reasoning.displayName = "Reasoning";

export const ReasoningGroup = memo(ReasoningGroupImpl);
ReasoningGroup.displayName = "ReasoningGroup";
