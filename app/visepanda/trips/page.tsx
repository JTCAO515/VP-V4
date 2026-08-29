import { TripListWorkspace } from "@/components/trips/TripListWorkspace";
import { requireClosedBetaSession } from "@/lib/server/identity/closed-beta-session-guard";

export const dynamic = "force-dynamic";

export default async function TripsPage() {
  await requireClosedBetaSession("/visepanda/trips");
  return <TripListWorkspace />;
}
