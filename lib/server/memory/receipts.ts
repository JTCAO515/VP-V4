import { projectRetrievableMemory, type MemoryConstraintKind, type MemoryProfile } from "./profile.ts";

export type MemoryConsumer = Readonly<{
  kind: "turn" | "proposal";
  id: string;
  ownerId: string;
}>;

export type MemoryConsumerReceipt = Readonly<{
  kind: "memory";
  consumerKind: MemoryConsumer["kind"];
  consumerId: string;
  memoryId: string;
  sourceReceiptId: string;
  constraintKind: MemoryConstraintKind;
}>;

export class MemoryConsumerReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryConsumerReceiptError";
  }
}

export function projectMemoryConsumerReceipts(
  consumer: MemoryConsumer,
  memories: readonly MemoryProfile[],
): readonly MemoryConsumerReceipt[] {
  if (!isBounded(consumer.id) || !isBounded(consumer.ownerId)) {
    throw new MemoryConsumerReceiptError("Memory consumer requires bounded owner and identifier");
  }
  if (consumer.kind !== "turn" && consumer.kind !== "proposal") {
    throw new MemoryConsumerReceiptError("Unknown memory consumer kind");
  }
  for (const memory of memories) {
    if (memory.ownerId !== consumer.ownerId) throw new MemoryConsumerReceiptError("Memory consumer owner mismatch");
  }
  return projectRetrievableMemory(memories).map((memory) => Object.freeze({
    kind: "memory" as const,
    consumerKind: consumer.kind,
    consumerId: consumer.id,
    memoryId: memory.id,
    sourceReceiptId: memory.sourceReceiptId,
    constraintKind: memory.constraintKind,
  }));
}

function isBounded(value: string): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= 160;
}
