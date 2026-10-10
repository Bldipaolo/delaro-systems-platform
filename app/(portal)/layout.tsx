import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getCurrentUserContext, isSupabaseConfigured } from "@/lib/auth/context";
import { canViewInternalWorkspace } from "@/lib/auth/permissions";
import { demoOverview } from "@/lib/domain";
import { redirect } from "next/navigation";

const roleLabels = { delaro_admin: "Delaro admin", delaro_consultant: "Delaro consultant", client_admin: "Client admin", client_user: "Client user", read_only: "Read only" } as const;

export default async function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const context = isSupabaseConfigured() ? await getCurrentUserContext() : null;
  if (isSupabaseConfigured() && !context) redirect("/access-pending");
  const organizationName = context?.organization.name ?? (isSupabaseConfigured() ? "Workspace unavailable" : demoOverview.organizationName);
  const userName = context?.profile?.fullName ?? context?.profile?.email ?? context?.user.email ?? (isSupabaseConfigured() ? "Account member" : "Jordan Davis");
  const userRole = context ? roleLabels[context.role] : (isSupabaseConfigured() ? "Client workspace" : "Client admin");
  return <div className="portal-shell"><Sidebar organizationName={organizationName} userName={userName} userRole={userRole}/><div className="portal-main"><Topbar organizationName={organizationName} demoMode={!isSupabaseConfigured()} canOpenInternal={context ? canViewInternalWorkspace(context.role) : false}/>{children}</div></div>;
}
