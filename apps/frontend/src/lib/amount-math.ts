/** Remove cancellation residue relative to the operands, without a currency-sized cutoff. */
export function amountDifference(current: number, prior: number): number {
  const difference = current - prior;
  const roundoff = Math.abs(current) * Number.EPSILON + Math.abs(prior) * Number.EPSILON;
  return Number.isFinite(difference) && Math.abs(difference) <= roundoff ? 0 : difference;
}

/** Sum signed amounts without losing small changes beside large cancelling values. */
export function sumAmounts(values: Iterable<number>): number {
  let sum = 0;
  let compensation = 0;
  let roundoff = 0;
  for (const value of values) {
    const next = sum + value;
    // Neumaier summation, as used for spending's per-currency net amounts.
    if (Number.isFinite(next)) {
      compensation += Math.abs(sum) >= Math.abs(value) ? sum - next + value : value - next + sum;
    } else {
      compensation = 0;
    }
    sum = next;
    roundoff += Math.abs(value) * Number.EPSILON;
  }
  const amount = sum + compensation;
  // Compensation removes addition error; the inputs can still carry representation residue.
  return Number.isFinite(amount) && Math.abs(amount) <= roundoff ? 0 : amount;
}
