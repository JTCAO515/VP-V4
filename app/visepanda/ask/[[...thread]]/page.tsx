import { ChatThreadWorkspace } from "@/components/chat/ChatThreadWorkspace";
import { isUuid } from "@/lib/server/identity/request-guards";

export default async function AskThreadPage({ params, searchParams }: { params: Promise<{ thread?: string[] }>; searchParams: Promise<{ tripId?: string; poiId?: string }> }) {
  const { thread } = await params;
  const { tripId, poiId } = await searchParams;
  const initialPlaceCandidate = tripId && poiId && isUuid(tripId) && isUuid(poiId) ? { tripId, poiId } : undefined;
  return <ChatThreadWorkspace initialThreadId={thread?.at(-1)} initialPlaceCandidate={initialPlaceCandidate} />;
}
