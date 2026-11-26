export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function percentile(values: number[], percentileValue: number): number | null {
  if (!values.length || percentileValue < 0 || percentileValue > 1) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const index = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function medianAbsoluteDeviation(values: number[]): number | null {
  const center = median(values);
  return center === null ? null : median(values.map((value) => Math.abs(value - center)));
}

export function interquartileRange(values: number[]): number | null {
  const low = percentile(values, 0.25);
  const high = percentile(values, 0.75);
  return low === null || high === null ? null : high - low;
}

export function percentageChange(current: number, reference: number): number | null {
  if (reference === 0) return null;
  return ((current - reference) / Math.abs(reference)) * 100;
}

export function finiteValues(values: Array<number | null | undefined>): number[] {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}
