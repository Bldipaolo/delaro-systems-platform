import type { MeasurementSourceStatus } from "@/lib/measurement-sources/types";

export function measurementSourceMakesDerivedValueStale(status: MeasurementSourceStatus | null | undefined) {
  return Boolean(status && status !== "healthy");
}
