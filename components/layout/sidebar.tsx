"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronIcon, DocumentIcon, InitiativeIcon, OverviewIcon, PerformanceIcon, ReviewIcon } from "./icons";

const navigation = [
  { label: "Home", href: "/overview", icon: OverviewIcon },
  { label: "Projects", href: "/initiatives", icon: InitiativeIcon },
  { label: "Results", href: "/performance", icon: PerformanceIcon },
  { label: "Files", href: "/documents", icon: DocumentIcon },
  { label: "Check-ins", href: "/reviews", icon: ReviewIcon },
] as const;

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return <>
    <button className="mobile-menu" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Toggle navigation">Menu</button>
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <div className="brand-mark"><span className="brand-symbol">D</span><span>DELARO</span></div>
      <div className="workspace-label">NORTHSTAR WORKSPACE</div>
      <button className="organization-switcher" type="button"><span className="organization-avatar">N</span><span className="organization-name"><strong>Northstar</strong><small>Client workspace</small></span><ChevronIcon size={15}/></button>
      <nav aria-label="Client navigation">
        <div className="nav-section-label">WORKSPACE</div>
        {navigation.map(({ label, href, icon: Icon }) => <Link key={label} href={href} className={`nav-link ${pathname === href ? "nav-link-active" : ""}`} onClick={() => setOpen(false)}><Icon size={17}/><span>{label}</span></Link>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="linear-horizon horizon-label"><span>CONTINUITY</span></div>
        <p>Map the work.<br/>Improve the system.</p>
        <div className="user-row"><span className="user-avatar">JD</span><span><strong>Jordan Davis</strong><small>Client admin</small></span></div>
      </div>
    </aside>
  </>;
}
