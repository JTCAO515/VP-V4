import { ProfileWorkspace } from "@/components/user/ProfileWorkspace";
import { requireClosedBetaSession } from "@/lib/server/identity/closed-beta-session-guard";
export const dynamic = "force-dynamic";
export default async function ProfilePage() { await requireClosedBetaSession("/visepanda/profile"); return <ProfileWorkspace />; }
