import {
  isLoanEvent,
  readLoanEvents,
  readLoanProjectionMetadata,
  getLoanFrequencyAtDate,
  LOAN_EVENTS_METADATA_KEY,
  type LoanMetadata,
} from "./loan-events";

/** Resolve inherited settings before the edited event, including same-day ordering. */
export function inheritedLoanSettings(metadata: LoanMetadata, index: number, date: string) {
  let raw = metadata[LOAN_EVENTS_METADATA_KEY];
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  const recorded = Array.isArray(raw) ? raw.filter(isLoanEvent) : [];
  const ordered = readLoanEvents({ [LOAN_EVENTS_METADATA_KEY]: recorded });
  const targetPosition = index < 0 ? recorded.length : recorded.indexOf(ordered[index]);
  const preceding = readLoanEvents({
    [LOAN_EVENTS_METADATA_KEY]: recorded.filter(
      (event, position) =>
        position !== targetPosition &&
        (event.effectiveDate < date || (event.effectiveDate === date && position < targetPosition)),
    ),
  });
  const priorMetadata = { ...metadata, [LOAN_EVENTS_METADATA_KEY]: preceding };
  const projection = readLoanProjectionMetadata(metadata);
  let interestMethod = projection?.interestMethod ?? "nominal_periodic";
  let annualRate = projection?.annualRate ?? 0;
  for (const event of preceding) {
    if (event.type === "renewal" && event.interestMethod) interestMethod = event.interestMethod;
    if (event.type === "renewal" || event.type === "rate_change") annualRate = event.annualRate;
  }
  return { frequency: getLoanFrequencyAtDate(priorMetadata, date), interestMethod, annualRate };
}
