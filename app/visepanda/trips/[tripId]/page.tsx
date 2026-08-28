import { TripCanvas } from "@/components/canvas/TripCanvas";

export default async function TripCanvasPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <TripCanvas tripId={tripId} />;
}
