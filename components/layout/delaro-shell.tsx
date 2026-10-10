"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowIcon, InitiativeIcon, OperationsIcon, OverviewIcon, PerformanceIcon, ReviewIcon, DocumentIcon } from "@/components/layout/icons";
import { DemoControls } from "@/components/layout/demo-controls";
import { signOutAction } from "@/app/(auth)/actions";

type InternalLink = readonly [string, string, (props: { size?: number }) => React.ReactNode];
const sections: { title: string; links: InternalLink[] }[] = [
  { title: "Workspace", links: [["Portfolio", "/portfolio", OverviewIcon], ["Clients", "/clients", OverviewIcon]] },
  { title: "Diagnose", links: [["Operations", "/internal/operations", OperationsIcon], ["Constraints", "/internal/constraints", ReviewIcon], ["Opportunities", "/opportunities", PerformanceIcon], ["Business cases", "/internal/business-cases", DocumentIcon]] },
  { title: "Deliver", links: [["Improvements", "/internal/initiatives", InitiativeIcon], ["Exceptions", "/internal/exceptions", OperationsIcon]] },
  { title: "Measure", links: [["Metrics", "/measurement", PerformanceIcon], ["Evidence", "/internal/evidence", DocumentIcon], ["Value realization", "/internal/value-realization", PerformanceIcon]] },
];

export function DelaroShell({ children, demoMode }: Readonly<{ children: React.ReactNode; demoMode: boolean }>) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);
  const current = sections.flatMap((section) => section.links).find(([, href]) => pathname === href)?.[0] ?? "Internal workspace";
  return <div className="portal-shell"><button className="mobile-menu" type="button" aria-expanded={open} aria-controls="delaro-navigation" aria-label={open ? "Close navigation" : "Open navigation"} onClick={() => setOpen(!open)}>{open ? "Close" : "Menu"}</button>{open && <button className="mobile-nav-backdrop" type="button" aria-label="Close navigation" onClick={() => setOpen(false)}/>}<aside className={`internal-sidebar ${open ? "sidebar-open" : ""}`} id="delaro-navigation"><div className="brand-mark"><span className="brand-symbol">D</span><span>DELARO</span></div><div className="workspace-label">INTERNAL WORKSPACE</div><nav aria-label="Delaro navigation">{sections.map((section) => <div className="internal-nav-group" key={section.title}><div className="nav-section-label">{section.title.toUpperCase()}</div>{section.links.map(([label, href, Icon]) => <Link href={href} key={href} onClick={() => setOpen(false)} aria-current={pathname === href ? "page" : undefined} className={`internal-nav-link ${pathname === href ? "internal-nav-active" : ""}`}><Icon size={16}/>{label}</Link>)}</div>)}</nav><div className="internal-sidebar-footer"><div className="linear-horizon horizon-label"><span>OPERATING SYSTEMS</span></div><p>Map the work.<br/>Improve the system.</p><span className="user-avatar">DC</span><small>Delaro consulting team</small></div></aside><div className="portal-main"><header className="topbar"><div className="breadcrumbs"><span>Delaro internal</span><span className="breadcrumb-separator">/</span><strong>{current}</strong></div><div className="topbar-actions"><span className="demo-label">Internal view</span>{demoMode && <DemoControls/>}<Link className="support-link" href="/overview">Open client view <ArrowIcon size={15}/></Link>{!demoMode && <><Link className="support-link" href="/account">Account</Link><form action={signOutAction}><button className="support-link" type="submit">Sign out</button></form></>}</div></header>{children}</div></div>;
}
