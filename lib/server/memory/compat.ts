type RpcError = Readonly<{ code?: string; message: string }>;

/** Only the unavailable v2 RPC is eligible for the old, no-Undo create path. */
export function missingMemoryCreateV2(error: RpcError): boolean {
  return error.code === "PGRST202" && error.message.includes("create_explicit_memory_profile_v2");
}

/** Before the additive migration, preserve the existing owner-scoped list. */
export function missingMemoryRevision(error: RpcError): boolean {
  return error.code === "42703" && error.message.includes("memory_profiles") &&
    error.message.includes("revision");
}
