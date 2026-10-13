import { Suspense } from "react";
import { QaAgentWorkspace } from "@/components/qa-agent/QaAgentWorkspace";

export const metadata = { title: "Agent QA | VisePanda" };

export default function QaPage() {
  return <Suspense fallback={<p role="status">Loading…</p>}><QaAgentWorkspace /></Suspense>;
}
