import { useMemo, useCallback } from "react";
import { walkJson } from "./json-path-suggestions";

interface RawResponseViewerProps {
  rawResponse: string;
  format: "json" | "html";
  onPathClick?: (path: string) => void;
}

/** Scrollable raw response viewer. JSON gets clickable numbers; HTML is plain text. */
export function RawResponseViewer({ rawResponse, format, onPathClick }: RawResponseViewerProps) {
  if (format === "json") {
    return <JsonPreview rawResponse={rawResponse} onPathClick={onPathClick} />;
  }
  return (
    <pre className="text-muted-foreground whitespace-pre-wrap break-all p-3 text-[12px] leading-relaxed">
      {rawResponse}
    </pre>
  );
}

function JsonPreview({
  rawResponse,
  onPathClick,
}: {
  rawResponse: string;
  onPathClick?: (path: string) => void;
}) {
  const { formatted, pathMap } = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(rawResponse);
      const entries = walkJson(parsed);
      const map = new Map<string, string>();
      for (const entry of entries) {
        const key = String(entry.value);
        if (!map.has(key)) {
          map.set(key, entry.path);
        }
      }
      return { formatted: JSON.stringify(parsed, null, 2), pathMap: map };
    } catch {
      return { formatted: rawResponse, pathMap: new Map<string, string>() };
    }
  }, [rawResponse]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const path = target.dataset?.jsonpath;
      if (path && onPathClick) {
        onPathClick(path);
      }
    },
    [onPathClick],
  );

  const htmlContent = useMemo(() => {
    // IMPORTANT: escape the entire string first to prevent XSS from malicious
    // JSON string values (e.g. "<img onerror=...>"), then insert clickable spans.
    const escaped = escapeHtml(formatted);

    if (pathMap.size === 0) return escaped;

    const usedPaths = new Map<string, number>();

    return escaped.replace(
      /: (-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      (match: string, numStr: string) => {
        const key = numStr;
        const count = usedPaths.get(key) ?? 0;
        usedPaths.set(key, count + 1);

        const entries = Array.from(pathMap.entries()).filter(([k]) => k === key);
        const entry = entries[0];
        if (!entry) return match; // already escaped

        const path = entry[1];
        // numStr is only digits/dots/e — no HTML-special chars — safe to inject as-is
        return `: <span class="json-number" data-jsonpath="${escapeAttr(path)}">${numStr}</span>`;
      },
    );
  }, [formatted, pathMap]);

  return (
    <pre
      className="json-preview p-3 text-[12px] leading-relaxed"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
