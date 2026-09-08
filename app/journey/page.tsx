import type { Metadata } from "next";
import { JourneyExperience } from "@/components/JourneyExperience";
import "./journey.css";

export const metadata: Metadata = {
  title: "VisePanda — A little wonder. A lot of China. | 遇见中国",
  description: "A new perspective on China. Discover VisePanda’s bilingual travel experience. 用好奇心，打开中国旅行的新一页。",
};

export default function JourneyPage() {
  return <JourneyExperience />;
}
