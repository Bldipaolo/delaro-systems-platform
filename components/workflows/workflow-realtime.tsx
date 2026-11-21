"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function WorkflowRealtime({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"connecting" | "live" | "fallback">(enabled ? "connecting" : "fallback");
  const refreshTimer = useRef<number | null>(null);

  useEffect(() => {
    const fallback = window.setInterval(() => router.refresh(), 60_000);
    if (!enabled) return () => window.clearInterval(fallback);
    const client = createClient();
    if (!client) return () => window.clearInterval(fallback);
    const channel = client.channel("client-workflow-executions")
      .on("postgres_changes", { event: "*", schema: "public", table: "workflow_executions" }, () => {
        if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
        refreshTimer.current = window.setTimeout(() => router.refresh(), 250);
      })
      .subscribe((status) => setState(status === "SUBSCRIBED" ? "live" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "fallback" : "connecting"));
    return () => {
      window.clearInterval(fallback);
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      void client.removeChannel(channel);
    };
  }, [enabled, router]);

  return <div className={`workflow-live-state workflow-live-${state}`} role="status" aria-live="polite"><span aria-hidden="true"/>{state === "live" ? "Live updates" : state === "connecting" ? "Connecting" : "Periodic refresh"}<button type="button" onClick={() => router.refresh()}>Refresh now</button></div>;
}
