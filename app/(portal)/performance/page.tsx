import { PerformanceDashboard } from "@/components/performance/performance-dashboard";

export default function PerformancePage() { return <main className="content"><section className="page-intro compact"><div><p className="eyebrow">What is changing</p><h1>Results</h1><p className="intro-copy">See what is improving, what still needs evidence, and where the next result should come from.</p></div></section><PerformanceDashboard/></main>; }
