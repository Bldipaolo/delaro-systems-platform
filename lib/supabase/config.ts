export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) return { url, key };
  if (process.env.NEXT_PUBLIC_DELARO_DEMO_MODE === "true" && process.env.NODE_ENV !== "production") return null;
  throw new Error("Supabase configuration is incomplete. Demo mode must be explicitly enabled in development.");
}
