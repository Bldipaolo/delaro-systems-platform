const allowedAuthDestinations = new Set(["/account", "/overview", "/access-pending"]);

export function safeAuthRedirectPath(value: string | null | undefined, fallback = "/overview") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(value, "https://delaro.invalid");
  } catch {
    return fallback;
  }
  if (parsed.origin !== "https://delaro.invalid" || !allowedAuthDestinations.has(parsed.pathname)) return fallback;
  return `${parsed.pathname}${parsed.search}`;
}

export function authCallbackDestination(input: { next?: string | null; flow?: string | null }) {
  if (input.flow === "recovery") return "/account?recovery=1";
  return safeAuthRedirectPath(input.next, "/overview");
}
