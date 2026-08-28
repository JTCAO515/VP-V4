import type { Metadata } from "next";
import { CopilotMemoryWorkspace } from "@/components/copilot/CopilotMemoryWorkspace";

export const metadata: Metadata = { title: "VisePanda Copilot", description: "VisePanda Copilot." };

export default function CopilotPage() { return <CopilotMemoryWorkspace />; }
