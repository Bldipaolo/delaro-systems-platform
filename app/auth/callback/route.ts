import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthCallbackAttempt } from "@/lib/auth/callback";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.has("error") || request.nextUrl.searchParams.has("error_code")) {
    return noStoreRedirect(request, "/login?error=expired_link");
  }

  const attempt = resolveAuthCallbackAttempt(request.nextUrl.searchParams);
  if (attempt.kind === "invalid") return noStoreRedirect(request, "/login?error=invalid_link");

  const supabase = await createClient();
  if (!supabase) return noStoreRedirect(request, "/login?error=unavailable");

  const result = attempt.kind === "code"
    ? await supabase.auth.exchangeCodeForSession(attempt.code)
    : await supabase.auth.verifyOtp({ token_hash: attempt.tokenHash, type: attempt.type });

  if (result.error || !result.data.session) return noStoreRedirect(request, "/login?error=expired_link");
  return noStoreRedirect(request, attempt.destination);
}

function noStoreRedirect(request: NextRequest, destination: string) {
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
