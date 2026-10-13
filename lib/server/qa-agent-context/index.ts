import type { ProtocolProvider } from "../model-gateway/adapters/provider-protocol.ts";

/** Server-owned original identities; never deserialize this binding from HTTP JSON. */
export type QaContextBinding = Readonly<{
  actorId: string; authSessionId: string; sessionId: string; taskId: string; scopeVersion: number;
  turnId: string; policyId: string; consentId: string; provider: ProtocolProvider; endpoint: string;
}>;
export const QA_CONTEXT_LIMITS = Object.freeze({
  historyMessages: 6, sourceTurns: 8, upstreamHistoryBytes: 65536,
  totalBytes: 16384, promptBytes: 32768,
  userCharacters: 4000, assistantCharacters: 8000,
});
export class QaContextError extends Error {
  constructor() { super("DATA_POLICY_BLOCKED"); this.name = "QaContextError"; }
}
