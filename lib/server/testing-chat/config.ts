/**
 * Internal-testing-only chatbot (testing.go2china.space). Not a public
 * product surface: exposes the real production grounded-turn/1 pipeline
 * (VPJ-16) behind an explicit opt-in flag plus a hostname check, on the
 * existing VP-V4 production Supabase project. Deployment configuration
 * (env vars) selects authority; request headers never do.
 */
export type TestingChatConfig = Readonly<{
  url: string;
  publishableKey: string;
  serviceRoleKey: string;
  glmApiKey: string;
  policyId: string;
  noticeHash: string;
}>;

const NOTICE_HASH = "a9f6d20e9d48be172e40b88381bac190cd40dbb8271c8e402f5d5fefee65cf95";

export function testingChatConfig(request: Pick<Request, "url">, env: NodeJS.ProcessEnv = process.env): TestingChatConfig | null {
  const { TESTING_CHAT_ENABLED, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    TESTING_CHAT_SERVICE_ROLE_KEY, TESTING_CHAT_GLM_API_KEY, TESTING_CHAT_POLICY_ID } = env;
  if (TESTING_CHAT_ENABLED !== "true" || !NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || !TESTING_CHAT_SERVICE_ROLE_KEY || !TESTING_CHAT_GLM_API_KEY || !TESTING_CHAT_POLICY_ID) return null;
  try {
    const url = new URL(request.url);
    const allowed = url.hostname === "testing.go2china.space" || (!env.VERCEL_ENV && ["localhost", "127.0.0.1"].includes(url.hostname));
    if (!allowed || url.username || url.password) return null;
  } catch { return null; }
  return {
    url: NEXT_PUBLIC_SUPABASE_URL, publishableKey: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    serviceRoleKey: TESTING_CHAT_SERVICE_ROLE_KEY, glmApiKey: TESTING_CHAT_GLM_API_KEY,
    policyId: TESTING_CHAT_POLICY_ID, noticeHash: NOTICE_HASH,
  };
}
