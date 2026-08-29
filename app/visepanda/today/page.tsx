import { TodayWorkspace } from "@/components/today/TodayWorkspace";
import { requireClosedBetaSession } from "@/lib/server/identity/closed-beta-session-guard";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  await requireClosedBetaSession(`/visepanda/today`);
  return <TodayWorkspace />;
}
