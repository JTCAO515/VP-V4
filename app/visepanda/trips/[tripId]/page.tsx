import { TripCanvas } from "@/components/canvas/TripCanvas";
import { requireClosedBetaSession } from "@/lib/server/identity/closed-beta-session-guard";

export const dynamic = "force-dynamic";

export default async function TripCanvasPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  await requireClosedBetaSession(`/visepanda/trips/${tripId}`);
  return <TripCanvas tripId={tripId} />;
}
