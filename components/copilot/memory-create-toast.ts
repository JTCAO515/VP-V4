type CreateBase = Readonly<{
  memoryId: string;
  state: "explicit";
  reused: boolean;
  ownerId: string;
}>;
export type CreateReceipt = CreateBase & (
  Readonly<{ undoAvailable: true; revision: number; sourceReceiptId: string }>
  | Readonly<{ undoAvailable: false; revision: null; sourceReceiptId: null }>
);

export function parseCreateReceipt(value: unknown, expected: Readonly<{
  memoryId: string; receiptId: string; ownerId: string;
}>): CreateReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("memory_create_receipt_invalid");
  const receipt = value as Record<string, unknown>;
  if (receipt.memoryId !== expected.memoryId || receipt.ownerId !== expected.ownerId ||
      receipt.state !== "explicit" || typeof receipt.reused !== "boolean")
    throw new Error("memory_create_receipt_invalid");
  const base: CreateBase = {
    memoryId: expected.memoryId,
    state: "explicit",
    reused: receipt.reused as boolean,
    ownerId: expected.ownerId,
  };
  if (receipt.undoAvailable === false && receipt.revision === null && receipt.sourceReceiptId === null)
    return { ...base, undoAvailable: false, revision: null, sourceReceiptId: null };
  if (receipt.undoAvailable !== true || receipt.sourceReceiptId !== expected.receiptId ||
      !Number.isSafeInteger(receipt.revision) || (receipt.revision as number) < 1)
    throw new Error("memory_create_receipt_invalid");
  return { ...base, undoAvailable: true, revision: receipt.revision as number,
    sourceReceiptId: expected.receiptId };
}

/** The first acknowledged response may itself be an idempotent replay. */
export function takeCreateToast(receipt: CreateReceipt, readbackOwnerId: string | null,
  shownMemoryIds: Set<string>): boolean {
  if (!receipt.undoAvailable || receipt.ownerId !== readbackOwnerId || receipt.revision !== 1 ||
      shownMemoryIds.has(receipt.memoryId)) return false;
  shownMemoryIds.add(receipt.memoryId);
  return true;
}

export function createReadbackIsCurrent(receipt: CreateReceipt, memory: Readonly<{
  id: string; sourceReceiptId: string; revision: number | null;
  state: string; consentStatus: string;
}> | undefined): boolean {
  return receipt.undoAvailable && memory?.id === receipt.memoryId && memory.sourceReceiptId === receipt.sourceReceiptId &&
    memory.revision === receipt.revision && memory.state === "explicit" &&
    memory.consentStatus === "granted";
}
