"use client";

import "@assistant-ui/react-markdown/styles/dot.css";

import {
  type CodeHeaderProps,
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from "@assistant-ui/react-markdown";
import { type FC, memo, useState } from "react";

import { Icons } from "@wealthfolio/ui/components/ui/icons";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";
import { TooltipIconButton } from "./tooltip-icon-button";

const MarkdownTextImpl = () => {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="aui-md prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent"
      components={customComponents}
    />
  );
};

export const MarkdownText = memo(MarkdownTextImpl);

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const onCopy = () => {
    if (!code || isCopied) return;
    copyToClipboard(code);
  };

  return (
    <div className="aui-code-header-root bg-muted-foreground/15 text-foreground dark:bg-muted-foreground/20 not-prose mt-4 flex items-center justify-between gap-4 rounded-t-lg px-4 py-2 text-sm font-semibold">
      <span className="aui-code-header-language lowercase [&>span]:text-xs">{language}</span>
      <TooltipIconButton tooltip="Copy" onClick={onCopy}>
        {!isCopied && <Icons.Copy />}
        {isCopied && <Icons.Check />}
      </TooltipIconButton>
    </div>
  );
};

const useCopyToClipboard = ({
  copiedDuration = 3000,
}: {
  copiedDuration?: number;
} = {}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const copyToClipboard = (value: string) => {
    if (!value) return;

    navigator.clipboard.writeText(value).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), copiedDuration);
    });
  };

  return { isCopied, copyToClipboard };
};

/**
 * Custom components for elements that need special handling beyond prose defaults.
 * Most elements use Tailwind Typography prose-sm defaults automatically.
 */
const customComponents = memoizeMarkdownComponents({
  // Custom code block styling with dark background
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        "aui-md-pre not-prose overflow-x-auto rounded-b-lg rounded-t-none bg-black p-4 text-sm text-white",
        className,
      )}
      {...props}
    />
  ),
  // Inline code styling
  code: function Code({ className, ...props }) {
    const isCodeBlock = useIsMarkdownCodeBlock();
    return (
      <code
        className={cn(
          !isCodeBlock && "aui-md-inline-code rounded border bg-muted px-1.5 py-0.5 font-mono text-sm font-medium before:content-none after:content-none",
          className,
        )}
        {...props}
      />
    );
  },
  // Code header with copy button
  CodeHeader,
  // Tables with better styling for data display
  table: ({ className, ...props }) => (
    <table
      className={cn(
        "aui-md-table not-prose my-3 w-full border-separate border-spacing-0 text-sm",
        className,
      )}
      {...props}
    />
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        "aui-md-th bg-muted px-3 py-2 text-left text-xs font-semibold first:rounded-tl-lg last:rounded-tr-lg",
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        "aui-md-td border-b border-l px-3 py-2 text-left text-sm last:border-r",
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }) => (
    <tr
      className={cn(
        "aui-md-tr m-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-bl-lg [&:last-child>td:last-child]:rounded-br-lg",
        className,
      )}
      {...props}
    />
  ),
});
