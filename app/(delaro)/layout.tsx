import { redirect } from "next/navigation";
import { DelaroShell } from "@/components/layout/delaro-shell";
import { getCurrentUserContext, isSupabaseConfigured } from "@/lib/auth/context";
import { canViewInternalWorkspace } from "@/lib/auth/permissions";

export default async function DelaroLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const context = await getCurrentUserContext();
  if (isSupabaseConfigured() && (!context || !canViewInternalWorkspace(context.role))) redirect("/overview");
  return <DelaroShell demoMode={!isSupabaseConfigured()}>{children}</DelaroShell>;
}
