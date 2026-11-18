import type { EmailOtpType } from "@supabase/supabase-js";
import { authCallbackDestination } from "./redirects.ts";

const allowedOtpTypes = new Set<EmailOtpType>(["invite", "magiclink", "recovery", "email"]);

export type AuthCallbackAttempt =
  | { kind: "code"; code: string; destination: string }
  | { kind: "otp"; tokenHash: string; type: EmailOtpType; destination: string }
  | { kind: "invalid" };

export function resolveAuthCallbackAttempt(params: URLSearchParams): AuthCallbackAttempt {
  const code = params.get("code")?.trim() ?? "";
  const tokenHash = params.get("token_hash")?.trim() ?? "";
  const rawType = params.get("type")?.trim() ?? "";

  // A callback must use exactly one exchange mechanism. Reject ambiguous or
  // oversized values rather than forwarding them to Auth.
  if (code && !tokenHash && code.length <= 2048) {
    return {
      kind: "code",
      code,
      destination: authCallbackDestination({
        next: params.get("next"),
        flow: params.get("flow"),
      }),
    };
  }

  if (!code && tokenHash && tokenHash.length <= 2048 && allowedOtpTypes.has(rawType as EmailOtpType)) {
    const type = rawType as EmailOtpType;
    return {
      kind: "otp",
      tokenHash,
      type,
      destination: authCallbackDestination({
        next: params.get("next"),
        flow: type === "recovery" ? "recovery" : params.get("flow"),
        type,
      }),
    };
  }

  return { kind: "invalid" };
}
