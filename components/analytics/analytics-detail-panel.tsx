import type { ReactNode } from "react";

export function AnalyticsDetailPanel({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return <article className="analytics-detail-panel"><header><h3>{title}</h3>{meta}</header>{children}</article>;
}
