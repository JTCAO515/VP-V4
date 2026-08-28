export const PRIVACY_DATA_SCOPES = [
  "profile",
  "memory",
  "trip",
  "turn",
  "user_artifact",
] as const;

export type PrivacyDataScope = (typeof PRIVACY_DATA_SCOPES)[number];
export type PrivacyAction = "export" | "delete";
export type PrivacyRequest = Readonly<{
  requestId: string;
  action: PrivacyAction;
  scopes: readonly PrivacyDataScope[];
  status: "requested";
  execution: "not_started";
}>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizePrivacyRequest(value: unknown): PrivacyRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.requestId !== "string" ||
    !UUID.test(input.requestId) ||
    (input.action !== "export" && input.action !== "delete") ||
    !hasAllPrivacyScopes(input.scopes) ||
    !Object.keys(input).every(
      (key) => key === "requestId" || key === "action" || key === "scopes",
    )
  )
    return null;
  return {
    requestId: input.requestId,
    action: input.action,
    scopes: [...PRIVACY_DATA_SCOPES],
    status: "requested",
    execution: "not_started",
  };
}

function hasAllPrivacyScopes(value: unknown): value is readonly PrivacyDataScope[] {
  return (
    Array.isArray(value) &&
    value.length === PRIVACY_DATA_SCOPES.length &&
    value.every((scope, index) => scope === PRIVACY_DATA_SCOPES[index])
  );
}
