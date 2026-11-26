import { NextResponse } from "next/server";
import { isValidCronAuthorization } from "@/lib/measurement-sources/scheduler-protocol";
import { runScheduledMeasurementSyncs } from "@/lib/measurement-sources/scheduler";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Scheduler is not configured." }, { status: 503 });
  }
  if (!isValidCronAuthorization(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  try {
    const outcomes = await runScheduledMeasurementSyncs();
    return NextResponse.json(
      { ok: true, claimed: outcomes.length, succeeded: outcomes.filter((item) => item.status === "succeeded").length },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Measurement source scheduler failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ ok: false, error: "Measurement synchronization could not be completed." }, { status: 503 });
  }
}
