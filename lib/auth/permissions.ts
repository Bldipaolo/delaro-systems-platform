import type { Role } from "@/lib/domain";

export const internalRoles: Role[] = ["delaro_admin", "delaro_consultant"];

export function canViewInternalWorkspace(role: Role): boolean {
  return internalRoles.includes(role);
}

export function canEditClientData(role: Role): boolean {
  return ["delaro_admin", "delaro_consultant", "client_admin"].includes(role);
}

export function canViewClientData(role: Role): boolean {
  return ["delaro_admin", "delaro_consultant", "client_admin", "client_user", "read_only"].includes(role);
}
