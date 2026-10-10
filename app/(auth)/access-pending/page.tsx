import { signOutAction } from "@/app/(auth)/actions";

export default function AccessPendingPage() {
  return <main className="auth-page"><div className="auth-panel"><div className="brand-mark auth-brand"><span className="brand-symbol">D</span><span>DELARO</span></div><div className="auth-copy"><p className="eyebrow">Account access</p><h1>Your workspace is being prepared.</h1><p>Your sign-in worked, but this account does not yet have an active client workspace. Contact your Delaro account owner to request access.</p></div><form action={signOutAction}><button className="auth-button" type="submit">Sign out <span>→</span></button></form></div><div className="auth-aside"><div className="linear-horizon auth-horizon"><span>SEE → IMPROVE → SHARE</span></div><p>Access is assigned to a specific organization before work is shared.</p></div></main>;
}
