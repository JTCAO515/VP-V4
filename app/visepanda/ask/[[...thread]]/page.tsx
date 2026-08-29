import { redirect } from "next/navigation";
import { isUuid } from "@/lib/server/identity/request-guards";
import { requireClosedBetaSession } from "@/lib/server/identity/closed-beta-session-guard";

export const dynamic = "force-dynamic";

export default async function AskThreadPage({ params, searchParams }: { params: Promise<{ thread?: string[] }>; searchParams: Promise<{ tripId?: string; poiId?: string }> }) {
  const { thread } = await params;
  const { tripId, poiId } = await searchParams;
  const initialThreadId = thread?.at(-1);
  await requireClosedBetaSession(initialThreadId && isUuid(initialThreadId) ? `/visepanda/ask/${initialThreadId}` : "/visepanda/ask");
  const query = new URLSearchParams();
  if (initialThreadId && isUuid(initialThreadId)) query.set("thread", initialThreadId);
  if (tripId && poiId && isUuid(tripId) && isUuid(poiId)) {
    query.set("tripId", tripId);
    query.set("poiId", poiId);
  }
  redirect(query.size > 0 ? `/visepanda?${query.toString()}` : "/visepanda");
}
