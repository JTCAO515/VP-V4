import { ChatThreadWorkspace } from "@/components/chat/ChatThreadWorkspace";

export default async function AskThreadPage({ params }: { params: Promise<{ thread?: string[] }> }) {
  const { thread } = await params;
  return <ChatThreadWorkspace initialThreadId={thread?.at(-1)} />;
}
