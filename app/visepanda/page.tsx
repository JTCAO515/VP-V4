import type { Metadata } from "next";
import { VisePandaChatWorkspace } from "@/components/VisePandaChatWorkspace";

export const metadata: Metadata = {
  title: "VisePanda AI | Chatbot and Trip Canvas preview",
  description: "VisePanda Chatbot and Trip Canvas product preview for independent travel in China.",
  alternates: { canonical: "https://go2china.space/visepanda" },
};

export default function VisePandaChatbotPage() {
  return <VisePandaChatWorkspace />;
}
