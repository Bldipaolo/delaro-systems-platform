import Link from "next/link";
import { ArrowIcon } from "./icons";
import { DemoControls } from "./demo-controls";
import { signOutAction } from "@/app/(auth)/actions";

export function Topbar({ organizationName, demoMode = true, canOpenInternal = false }: { organizationName: string; demoMode?: boolean; canOpenInternal?: boolean }) {
  return <header className="topbar"><div className="breadcrumbs"><span>{organizationName}</span><span className="breadcrumb-separator">/</span><strong>Client workspace</strong></div><div className="topbar-actions">{demoMode && <><span className="demo-label">Demo workspace</span><DemoControls/></>}{canOpenInternal && <Link className="support-link" href="/opportunities">Open internal view <ArrowIcon size={15}/></Link>}{!demoMode && <><Link className="support-link" href="/account">Account</Link><form action={signOutAction}><button className="support-link" type="submit">Sign out</button></form></>}</div></header>;
}
