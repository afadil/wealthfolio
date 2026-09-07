export function simulationReferenceBand(rate: number) {
  const percent = Math.round(rate * 100);
  return percent < 75 ? "low" : percent < 90 ? "middle" : "high";
}
