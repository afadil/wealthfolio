import { Icons, Tooltip, TooltipContent, TooltipTrigger } from "@wealthfolio/ui";

/** The faint wash a list row needing review takes. */
export const NEEDS_REVIEW_ROW_CLASS = "bg-warning/5";
/** The same for a card in a phone list; the card must also be `relative overflow-hidden`. */
export const NEEDS_REVIEW_CARD_CLASS = "border-warning/40 bg-warning/5";

/** The amber stripe on the row's leading edge; its cell must be `relative`. */
export function NeedsReviewStripe() {
  return <span className="bg-warning absolute inset-y-0 start-0 w-[3px]" aria-hidden="true" />;
}

/**
 * The stripe carries the state too, but colour alone says nothing to a screen
 * reader or to a reader who cannot separate amber from the row behind it, so
 * the row also shows this icon. Hovering or focusing it tells why the row needs
 * review: the source's reasons when it gave any, else the general explanation.
 */
export function NeedsReviewIcon({
  label,
  reasons = [],
  explanation,
}: {
  label: string;
  reasons?: string[];
  /** Shown when there are no reasons, one paragraph per line. */
  explanation?: string[];
}) {
  const detail = reasons.length ? reasons.join("; ") : explanation?.join(" ");
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="text-warning focus-visible:outline-ring inline-flex shrink-0 rounded-sm focus-visible:outline-2"
            aria-label={detail ? `${label}: ${detail}` : label}
          />
        }
      >
        <Icons.AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="font-medium">{label}</p>
        {reasons.length > 0 ? (
          <ul className="mt-1 list-disc space-y-0.5 ps-4">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : (
          explanation?.map((line) => (
            <p key={line} className="first:mt-1">
              {line}
            </p>
          ))
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The icon alone, for a card that may itself be a link or tap target: a touch
 * screen has no hover, and a button inside a link is not allowed.
 */
export function NeedsReviewMark({ label }: { label: string }) {
  return (
    <span className="text-warning shrink-0">
      <Icons.AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
