export type AuthDirectoryUser = { id: string; email?: string | null };

type QueryResult<T> = PromiseLike<{ data: T; error: { code?: string; message?: string } | null }>;

export type InvitationAdminClient = {
  from(table: "profiles"): {
    select(columns: "id,email"): {
      eq(column: "email", value: string): {
        maybeSingle(): QueryResult<{ id: string; email: string } | null>;
      };
    };
  };
  auth: {
    admin: {
      getUserById(id: string): Promise<{ data: { user: AuthDirectoryUser | null }; error: { code?: string; message?: string } | null }>;
      inviteUserByEmail(email: string, options: { redirectTo: string; data: Record<string, string> }): Promise<{ data: { user: AuthDirectoryUser | null }; error: { code?: string; message?: string } | null }>;
    };
  };
};

export async function resolveAuthUserByEmail(admin: InvitationAdminClient, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const { data: profile, error: profileError } = await admin.from("profiles").select("id,email")
    .eq("email", normalizedEmail).maybeSingle();
  if (profileError) throw new Error("Unable to check the client account directory.");
  if (!profile) return null;

  const { data, error } = await admin.auth.admin.getUserById(profile.id);
  if (error || !data.user) throw new Error("The client account directory is inconsistent. Contact support before retrying.");
  if (data.user.email?.trim().toLowerCase() !== normalizedEmail) {
    throw new Error("The client account directory is inconsistent. Contact support before retrying.");
  }
  return data.user;
}

export async function inviteOrResolveAuthUser(admin: InvitationAdminClient, input: {
  email: string;
  redirectTo: string;
  organizationName: string;
}) {
  const existing = await resolveAuthUserByEmail(admin, input.email);
  if (existing) return { user: existing, outcome: "existing" as const };

  const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
    redirectTo: input.redirectTo,
    data: { invited_to_organization: input.organizationName },
  });
  if (!error && data.user) return { user: data.user, outcome: "invited" as const };

  // Another request may have created the Auth account after our initial lookup.
  const raced = await resolveAuthUserByEmail(admin, input.email);
  if (raced) return { user: raced, outcome: "existing" as const };
  throw new Error("Unable to send the client invitation. Verify the email and Auth redirect settings.");
}
