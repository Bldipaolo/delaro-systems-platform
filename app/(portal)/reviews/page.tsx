import Link from "next/link";
import { ReviewHub } from "@/components/reviews/review-hub";
import { getCurrentUserContext, isSupabaseConfigured } from "@/lib/auth/context";
import { demoOverview } from "@/lib/domain";

export default async function ReviewsPage() {
  const context = isSupabaseConfigured() ? await getCurrentUserContext() : null;
  const organizationName = context?.organization.name ?? (isSupabaseConfigured() ? "Workspace unavailable" : demoOverview.organizationName);
  return <main className="content"><section className="page-intro compact"><div><p className="eyebrow">Shared record</p><h1>Check-ins</h1><p className="intro-copy">A record of conversations and progress. Use Decisions for questions, recommendations, exceptions, and approvals.</p></div></section>{isSupabaseConfigured() ? <section className="empty-state"><h2>No check-ins shared yet</h2><p>Past conversations will appear here when the review record is connected.</p><Link className="text-link" href="/decisions">Open decisions →</Link></section> : <ReviewHub organizationName={organizationName}/>}</main>;
}
