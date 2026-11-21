import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { isUnauthenticatedServerEndpoint } from "@/lib/auth/public-routes";

export async function middleware(request: NextRequest) {
  const config = getSupabasePublicConfig();

  // Only explicitly enabled development demo mode may bypass authentication.
  if (!config) return NextResponse.next();
  if (request.nextUrl.pathname === "/auth/callback") return NextResponse.next();
  // Machine-to-machine endpoints perform their own scoped authentication.
  if (isUnauthenticatedServerEndpoint(request.nextUrl.pathname)) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user && request.nextUrl.pathname !== "/login") {
    const destination = request.nextUrl.pathname === "/account" && request.nextUrl.searchParams.get("recovery") === "1"
      ? "/login?error=expired_link"
      : "/login";
    const redirect = NextResponse.redirect(new URL(destination, request.url));
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
