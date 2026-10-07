"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowIcon, InitiativeIcon, OverviewIcon, PerformanceIcon, ReviewIcon } from "@/components/layout/icons";
import { DemoControls } from "@/components/layout/demo-controls";

const links = [
  ["Portfolio", "/portfolio", OverviewIcon],
  ["Clients", "/clients", OverviewIcon],
  ["Opportunities", "/opportunities", PerformanceIcon],
  ["Initiatives", "/internal/initiatives", InitiativeIcon],
  ["Measurement", "/measurement", PerformanceIcon],
  ["Reviews", "/reviews", ReviewIcon],
] as const;

export default function DelaroLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const current = links.find(([, href]) => pathname === href)?.[0] ?? "Opportunity pipeline";
  return <div className="portal-shell"><aside className="internal-sidebar"><div className="brand-mark"><span className="brand-symbol">D</span><span>DELARO</span></div><div className="workspace-label">INTERNAL WORKSPACE</div><nav aria-label="Delaro navigation">{links.map(([label, href, Icon]) => <Link href={href} key={label} className={`internal-nav-link ${pathname === href ? "internal-nav-active" : ""}`}><Icon size={16}/>{label}</Link>)}</nav><div className="internal-sidebar-footer"><span className="linear-horizon">OPERATING SYSTEMS</span><p>Map the work.<br/>Improve the system.</p><span className="user-avatar">DC</span><small>Delaro consulting team</small></div></aside><div className="portal-main"><header className="topbar"><div className="breadcrumbs"><span>Delaro internal</span><span className="breadcrumb-separator">/</span><strong>{current}</strong></div><div className="topbar-actions"><span className="demo-label">Internal view</span><DemoControls/><Link className="support-link" href="/overview">Open client view <ArrowIcon size={15}/></Link></div></header>{children}</div></div>;
}
