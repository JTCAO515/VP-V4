import { ReadinessWorkspace } from "@/components/readiness/ReadinessWorkspace";
import { requireClosedBetaSession } from "@/lib/server/identity/closed-beta-session-guard";
export const dynamic = "force-dynamic";
export default async function ReadyPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  await requireClosedBetaSession(`/visepanda/trips/${tripId}/ready`);
  return <ReadinessWorkspace tripId={tripId} />;
}
