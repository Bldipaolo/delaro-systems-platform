export function formatCurrency(
  value: number | null,
  currencyCode: string | null,
  options: { compact?: boolean; maximumFractionDigits?: number; pendingLabel?: string } = {},
): string {
  if (value === null || !currencyCode) return options.pendingLabel ?? "Pending";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    notation: options.compact ? "compact" : "standard",
    maximumFractionDigits: options.maximumFractionDigits ?? (options.compact ? 1 : 2),
  }).format(value);
}

export function formatPercentage(value: number | null, maximumFractionDigits = 1): string {
  if (value === null) return "Pending";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits,
  }).format(value / 100);
}

export function formatDate(value: string | null, emptyLabel = "Not measured"): string {
  if (!value) return emptyLabel;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}

export function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return "Period not provided";
  if (!start || !end || start === end) return formatDate(end ?? start, "Period not provided");
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export function formatUnitValue(value: number | null, unit: string): string {
  if (value === null) return "Pending";
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  if (unit === "%") return `${formatted}%`;
  if (/^\$($|\s|\/)/.test(unit)) return `$${formatted}${unit.slice(1)}`;
  return unit ? `${formatted} ${unit}` : formatted;
}
