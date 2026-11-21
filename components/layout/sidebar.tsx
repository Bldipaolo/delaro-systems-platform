"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { CloseIcon, DecisionIcon, DocumentIcon, InitiativeIcon, MenuIcon, OperationsIcon, OverviewIcon, PerformanceIcon } from "./icons";
import { useMobileNavigation } from "./use-mobile-navigation";

const navigation = [
  { label: "Home", href: "/overview", icon: OverviewIcon },
  { label: "Operations", href: "/operations", icon: OperationsIcon },
  { label: "Workflows", href: "/workflows", icon: OperationsIcon },
  { label: "Improvements", href: "/improvements", icon: InitiativeIcon },
  { label: "Impact", href: "/impact", icon: PerformanceIcon },
  { label: "Files", href: "/documents", icon: DocumentIcon },
  { label: "Decisions", href: "/decisions", icon: DecisionIcon },
] as const;

export function Sidebar({ organizationName, userName, userRole }: { organizationName: string; userName: string; userRole: string }) {
  const { open, setOpen, panelRef, triggerRef } = useMobileNavigation();
  const pathname = usePathname();
  const organizationInitial = organizationName.trim().charAt(0).toUpperCase() || "D";
  const userInitials = userName.split(/\s+/).map((part) => part.charAt(0)).slice(0, 2).join("").toUpperCase();
  return <>
    <button ref={triggerRef} className="mobile-menu" type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="client-navigation" aria-label="Open navigation"><MenuIcon size={18}/><span>Menu</span></button>
    {open && <button className="mobile-nav-backdrop" type="button" tabIndex={-1} aria-label="Close navigation" onClick={() => setOpen(false)}/>}
    <aside ref={panelRef} className={`sidebar ${open ? "sidebar-open" : ""}`} id="client-navigation" role={open ? "dialog" : undefined} aria-modal={open || undefined} aria-label={open ? "Client navigation" : undefined}>
      <button className="mobile-nav-close" type="button" aria-label="Close navigation" onClick={() => setOpen(false)}><CloseIcon size={19}/></button>
      <div className="brand-mark"><span className="brand-symbol">D</span><span>DELARO</span></div>
      <div className="workspace-label">{organizationName.toUpperCase()} WORKSPACE</div>
      <div className="organization-switcher"><span className="organization-avatar">{organizationInitial}</span><span className="organization-name"><strong>{organizationName}</strong><small>Client workspace</small></span></div>
      <nav aria-label="Client navigation">
        <div className="nav-section-label">WORKSPACE</div>
        {navigation.map(({ label, href, icon: Icon }) => <Link key={label} href={href} aria-current={pathname === href ? "page" : undefined} className={`nav-link ${pathname === href ? "nav-link-active" : ""}`} onClick={() => setOpen(false)}><Icon size={17}/><span>{label}</span></Link>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="linear-horizon horizon-label"><span>CONTINUITY</span></div>
        <p>Map the work.<br/>Improve the system.</p>
        <div className="user-row"><span className="user-avatar">{userInitials}</span><span><strong>{userName}</strong><small>{userRole}</small></span></div>
      </div>
    </aside>
  </>;
}
