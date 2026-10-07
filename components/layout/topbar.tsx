import Link from "next/link";
import { ArrowIcon } from "./icons";
import { DemoControls } from "./demo-controls";

export function Topbar() {
  return <header className="topbar"><div className="breadcrumbs"><span>Northstar Manufacturing</span><span className="breadcrumb-separator">/</span><strong>Client workspace</strong></div><div className="topbar-actions"><span className="demo-label">Demo workspace</span><DemoControls/><Link className="support-link" href="/opportunities">Delaro view <ArrowIcon size={15}/></Link></div></header>;
}
