import { headers } from "next/headers";
import { getNativeRuntimeConfig } from "@/lib/server/identity/native-config";
import { TripCanvas } from "@/components/canvas/TripCanvas";
import { requireClosedBetaSession } from "@/lib/server/identity/closed-beta-session-guard";

export const dynamic = "force-dynamic";

export default async function TripCanvasPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  await requireClosedBetaSession(`/visepanda/trips/${tripId}`);
  const incoming = await headers();
  const config = getNativeRuntimeConfig({ url: `https://${incoming.get("host") ?? ""}` }, "trip");
  return <TripCanvas tripId={tripId} localTripEnabled={Boolean(config)} />;
}
