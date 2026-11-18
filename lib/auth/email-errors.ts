type AuthEmailError = { code?: string; message?: string; status?: number } | null;

export function authEmailCooldownSeconds(error: AuthEmailError, fallback = 60) {
  if (!error || (error.status !== 429 && !error.code?.includes("rate_limit"))) return 0;
  const seconds = error.message?.match(/after\s+(\d+)\s+seconds?/i)?.[1];
  return seconds ? Math.max(1, Number(seconds)) : fallback;
}

export function authEmailErrorMessage(error: AuthEmailError, purpose: "sign-in" | "recovery") {
  const cooldown = authEmailCooldownSeconds(error);
  if (cooldown) {
    return purpose === "recovery"
      ? `Password-reset email is temporarily limited. Try again in ${cooldown} seconds.`
      : `Email sign-in is temporarily limited. Try again in ${cooldown} seconds, or sign in with your password.`;
  }
  return purpose === "recovery"
    ? "We could not send a reset link right now. Please try again later."
    : "We could not send a sign-in link. Please try again later or contact your Delaro account owner.";
}
