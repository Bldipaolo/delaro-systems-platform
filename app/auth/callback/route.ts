import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));

  const supabase = await createClient();
  if (!supabase) return NextResponse.redirect(new URL("/login?error=unavailable", request.url));
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=expired_link", request.url));
  const destination = request.nextUrl.searchParams.get("flow") === "recovery" ? "/account?recovery=1" : "/overview";
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
