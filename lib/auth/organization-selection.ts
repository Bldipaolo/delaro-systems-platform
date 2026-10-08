/** A browser preference may select only an organization already resolved for this user. */
export function selectActiveMembership<T extends { organizationId: string }>(
  memberships: T[],
  availableOrganizationIds: ReadonlySet<string>,
  preferredOrganizationId?: string,
): T | null {
  const eligible = memberships.filter((membership) => availableOrganizationIds.has(membership.organizationId));
  return eligible.find((membership) => membership.organizationId === preferredOrganizationId) ?? eligible[0] ?? null;
}

export function assertActiveOrganizationId(activeOrganizationId: string, requestedOrganizationId: string) {
  if (activeOrganizationId !== requestedOrganizationId) {
    throw new Error("Organization context does not match the authenticated user.");
  }
}
