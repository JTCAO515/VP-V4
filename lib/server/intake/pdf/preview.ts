import { applyPatch, assertTripSnapshot, type TripPatchOperation, type TripSnapshot } from "../../trip/patch/contract.ts";
import { pdfDigest, type PdfCommand, type PdfPreview } from "./contract.ts";

const key = (v: unknown) => pdfDigest(v).slice(0, 16);
/** An additive proposal only: a correction never overwrites an existing activity, order, date, or ordering. */
export function buildPdfPreview(tripId: string, snapshot: TripSnapshot, command: PdfCommand): PdfPreview {
  assertTripSnapshot(snapshot);
  if (snapshot.version !== command.expectedHeadVersion) throw Error("STALE_TRIP_VERSION");
  const dateField = command.fields.find(f => f.kind === "date");
  if (!dateField) throw Error("INVALID_INPUT");
  const group = key([tripId, command.contentHash]);
  const dayPrefix = `pdfd_${group}_`;
  const dayId = snapshot.days.find(d => d.date === dateField.value)?.id ?? `${dayPrefix}${key(dateField.value)}`;
  const target = snapshot.days.find(d => d.id === dayId);
  const previousDays = snapshot.days.filter(d => d.id.startsWith(dayPrefix)
    || d.items?.some(i => i.id.startsWith(`pdfi_${group}_`)));
  const operations: TripPatchOperation[] = [];
  if (!target) operations.push({ kind: "upsert_day", dayId, date: dateField.value });
  const fields: PdfPreview["fields"][number][] = [];
  fields.push({ ...dateField, state: previousDays.some(d => d.date !== dateField.value) ? "conflict" : target ? "duplicate" : "added" });
  const additions: string[] = [];
  for (const field of command.fields.filter(f => f.kind !== "date")) {
    const prefix = `pdfi_${group}_${field.kind}_`;
    const itemId = `${prefix}${key([dateField.value, field.value, field.locator])}`;
    const title = `User-checked PDF P${field.locator.page} L${field.locator.line} · ${field.kind}: ${field.value}`;
    if (title.length > 160) throw Error("INVALID_INPUT");
    const previous = snapshot.days.flatMap(d => (d.items ?? []).map(i => ({ day: d, item: i }))).filter(p => p.item.id.startsWith(prefix));
    const sameId = previous.find(p => p.item.id === itemId);
    const duplicate = sameId?.day.id === dayId && sameId.item.title === title && sameId.item.startsAt === undefined && sameId.item.endsAt === undefined;
    fields.push({ ...field, state: duplicate ? "duplicate" : previous.length ? "conflict" : "added" });
    // A changed/colliding ID is never overwritten. The user must resolve it in the original Trip editor.
    if (sameId && !duplicate) throw Error("PROPOSAL_NOT_CONFIRMABLE");
    if (!duplicate) {
      operations.push({ kind: "upsert_item", itemId, dayId, title });
      additions.push(itemId);
    }
  }
  if (additions.length && target?.items?.length) operations.push({ kind: "reorder_items", dayId,
    itemIds: [...target.items.map(i => i.id), ...additions] });
  const patch = operations.length ? { expectedVersion: snapshot.version, operations } : null;
  if (patch) {
    const next = applyPatch(snapshot, patch);
    // preserve original relative order and every field on existing items, including explicit fixed time windows.
    for (const before of snapshot.days) {
      const after = next.days.find(d => d.id === before.id);
      if (!after || after.date !== before.date || after.timeZone !== before.timeZone) throw Error("PROPOSAL_NOT_CONFIRMABLE");
      const originalIds = new Set(before.items?.map(i => i.id));
      const retained = after.items?.filter(i => originalIds.has(i.id)) ?? [];
      if (retained.length !== (before.items?.length ?? 0)
        || retained.some((i, n) => i.id !== before.items?.[n].id || i.title !== before.items[n].title
          || i.startsAt !== before.items[n].startsAt || i.endsAt !== before.items[n].endsAt)) throw Error("PROPOSAL_NOT_CONFIRMABLE");
    }
  }
  const orderedFields = command.fields.map(f => fields.find(p => p.kind === f.kind)!);
  const commandDigest = pdfDigest(command);
  return { kind: "pdf_intake_preview/1", operationId: command.operationId, tripId, headVersion: snapshot.version,
    commandDigest, previewDigest: pdfDigest([tripId, commandDigest, patch, orderedFields]), expiresAt: command.expiresAt,
    relation: orderedFields.some(f => f.state === "conflict") ? "conflict" : patch ? "new" : "duplicate", fields: orderedFields,
    patch, requiresExplicitConfirmation: true, evidenceTier: "user_checked_local_pdf", sourceAvailability: "local_only", orderVerification: "unavailable" };
}
