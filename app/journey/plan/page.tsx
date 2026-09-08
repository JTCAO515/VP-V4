import type { Metadata } from "next";
import JourneyPreview from "@/components/journey-preview/JourneyPreview";
import "./imported-demo.css";
import "./planning.css";

export const metadata: Metadata = {
  title: "Journey Studio — VisePanda interactive preview",
  description: "Explore the VisePanda journey demo. Prepared conversations and local preview interactions only; no live AI, bookings or saved account data.",
  robots: { index: false, follow: false },
};

export default function JourneyPlanPage() { return <JourneyPreview />; }
