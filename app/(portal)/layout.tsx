import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="portal-shell"><Sidebar/><div className="portal-main"><Topbar/>{children}</div></div>;
}
