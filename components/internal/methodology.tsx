import Link from "next/link";
import { Children, type ReactNode } from "react";

export function InternalPage({ stage, title, description, demo, children }: { stage: string; title: string; description: string; demo?: boolean; children: ReactNode }) {
  return <main className="content internal-content methodology-page"><section className="page-intro compact"><div><p className="eyebrow">{stage}</p><h1>{title}</h1><p className="intro-copy">{description}</p></div>{demo && <span className="methodology-demo">Northstar · Demo examples</span>}</section>{children}</main>;
}

export function DataSection({ title, children, empty }: { title: string; children: ReactNode; empty?: string }) {
  return <section className="methodology-section"><div className="section-heading"><h2>{title}</h2></div>{Children.count(children) ? children : <p className="methodology-empty">{empty ?? "No records yet."}</p>}</section>;
}

export function DataRow({ title, subtitle, values, href }: { title: string; subtitle?: string | null; values: { label: string; value: ReactNode }[]; href?: string }) {
  return <article className="methodology-row"><div className="methodology-row-main"><h3>{href ? <Link href={href}>{title}</Link> : title}</h3>{subtitle && <p>{subtitle}</p>}</div><dl>{values.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value ?? "Pending"}</dd></div>)}</dl></article>;
}

export function formatMoney(value: number | null, currency = "USD") {
  return value === null ? "Not recorded" : new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}
