import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatThreadWorkspace } from "@/components/chat/ChatThreadWorkspace";

export const metadata: Metadata = {
  title: "VisePanda",
  alternates: { canonical: "https://go2china.space/visepanda" },
};

export default function VisePandaWorkspacePage() {
  return <Suspense><ChatThreadWorkspace /></Suspense>;
}
