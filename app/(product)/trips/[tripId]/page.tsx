import type { Metadata } from "next";
import { TripCanvas } from "@/components/canvas/TripCanvas";

export const metadata: Metadata = {
  title: "Trip Canvas | VisePanda",
  description: "Review and confirm one authenticated VisePanda Trip proposal.",
};

export default async function TripCanvasPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <TripCanvas tripId={tripId} />;
}
