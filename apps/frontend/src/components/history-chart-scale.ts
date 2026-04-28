const LOG_SCALE_MIN_POINTS = 3;
const LOG_SCALE_MIN_RATIO = 10;
const LINEAR_DOMAIN_PADDING_RATIO = 0.15;
const LINEAR_MIN_VISIBLE_SPAN_RATIO = 0.0001;
const LINEAR_MIN_VISIBLE_SPAN = 0.01;

export type HistoryChartScale = "linear" | "log";

export interface HistoryChartScaleDataPoint {
  totalValue: number;
  netContribution: number;
}

export interface HistoryChartScaleConfig {
  scale: HistoryChartScale;
  domain: [number, number];
  showNetContribution: boolean;
}

function getLinearDomain(values: number[]): [number, number] {
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const center = (minValue + maxValue) / 2;
  const range = maxValue - minValue;
  const minVisibleSpan = Math.max(
    Math.abs(center) * LINEAR_MIN_VISIBLE_SPAN_RATIO,
    LINEAR_MIN_VISIBLE_SPAN,
  );
  const span = Math.max(range * (1 + LINEAR_DOMAIN_PADDING_RATIO * 2), minVisibleSpan);
  let lower = center - span / 2;
  let upper = center + span / 2;

  if (minValue >= 0 && lower < 0) {
    lower = 0;
    upper = span;
  }

  return [lower, upper];
}

function containsAllValues(domain: [number, number], values: number[]) {
  const [lower, upper] = domain;
  return values.every((value) => Number.isFinite(value) && value >= lower && value <= upper);
}

export function getAutomaticHistoryChartScale(
  data: HistoryChartScaleDataPoint[],
): HistoryChartScaleConfig {
  const totalValues = data.map((item) => item.totalValue).filter(Number.isFinite);

  if (totalValues.length === 0) {
    return { scale: "linear", domain: [0, 1], showNetContribution: false };
  }

  const linearDomain = getLinearDomain(totalValues);
  const netContributionValues = data.map((item) => item.netContribution);
  const showNetContributionInLinearScale = containsAllValues(linearDomain, netContributionValues);

  if (totalValues.length < LOG_SCALE_MIN_POINTS) {
    return {
      scale: "linear",
      domain: linearDomain,
      showNetContribution: showNetContributionInLinearScale,
    };
  }

  if (totalValues.some((value) => value <= 0)) {
    return {
      scale: "linear",
      domain: linearDomain,
      showNetContribution: showNetContributionInLinearScale,
    };
  }

  const minTotalValue = Math.min(...totalValues);
  const maxTotalValue = Math.max(...totalValues);

  if (maxTotalValue / minTotalValue < LOG_SCALE_MIN_RATIO) {
    return {
      scale: "linear",
      domain: linearDomain,
      showNetContribution: showNetContributionInLinearScale,
    };
  }

  const logDomain: [number, number] = [minTotalValue * 0.95, maxTotalValue * 1.05];
  const showNetContribution = netContributionValues.every(
    (value) =>
      Number.isFinite(value) && value > 0 && value >= logDomain[0] && value <= logDomain[1],
  );

  return {
    scale: "log",
    domain: logDomain,
    showNetContribution,
  };
}
