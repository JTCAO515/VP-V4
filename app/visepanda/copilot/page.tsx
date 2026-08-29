import type { Metadata } from "next";
import { CopilotMemoryWorkspace } from "@/components/copilot/CopilotMemoryWorkspace";
import { requireClosedBetaSession } from "@/lib/server/identity/closed-beta-session-guard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "VisePanda Copilot", description: "VisePanda Copilot." };

export default async function CopilotPage() { await requireClosedBetaSession("/visepanda/copilot"); return <CopilotMemoryWorkspace />; }
