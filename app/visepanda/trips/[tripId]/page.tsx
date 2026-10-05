import { headers } from "next/headers";
import { getNativeRuntimeConfig } from "@/lib/server/identity/native-config";
import { TripCanvas } from "@/components/canvas/TripCanvas";
import { requireClosedBetaSession } from "@/lib/server/identity/closed-beta-session-guard";
import { placeProposalReference } from "@/lib/server/explore/proposal-review-reference";

export const dynamic = "force-dynamic";

export default async function TripCanvasPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { tripId } = await params;
  await requireClosedBetaSession(`/visepanda/trips/${tripId}`);
  const query = await searchParams;
  const hasReference = Object.keys(query).some(k => ["proposalId", "proposalRevision", "proposalDigest", "baseVersion"].includes(k));
  const reference = hasReference && Object.keys(query).length === 4 && [query.proposalRevision, query.baseVersion].every(v => typeof v === "string" && /^(0|[1-9]\d{0,9})$/.test(v))
    ? placeProposalReference({ id: query.proposalId, revision: Number(query.proposalRevision), digest: query.proposalDigest, baseVersion: Number(query.baseVersion) }) : null;
  if (hasReference && !reference) return <main><p role="status">This Proposal reference is unavailable. / 此提案引用暂不可用。</p><a href="/places">Return to places / 返回地点</a></main>;
  const incoming = await headers();
  const config = getNativeRuntimeConfig({ url: `https://${incoming.get("host") ?? ""}` }, "trip");
  return <TripCanvas key={reference ? `${tripId}:${reference.id}:${reference.revision}:${reference.digest}:${reference.baseVersion}` : tripId} tripId={tripId} localTripEnabled={Boolean(config)} initialProposalReference={reference ?? undefined} />;
}
