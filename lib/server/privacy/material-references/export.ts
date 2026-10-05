import { exact, record } from '../../guide/contract.ts';
import { MATERIAL_LIMITS, materialBindingKeys, validMaterialBinding, sameMaterialSelection, materialDigest, type MaterialActor,
  type MaterialBinding, type MaterialCommand } from './contract.ts';
import { materialRowKey } from './rows.ts';
import { sameMaterialBinding, decodeMaterialBundle, type MaterialBundle } from './protocol.ts';

export type MaterialRPC = (action: string, originalBytes: string, signal: AbortSignal) => Promise<unknown>;
function fail(): never { throw Error('MATERIAL_SOURCE_UNAVAILABLE'); }
export async function collectMaterialExport(command: Extract<MaterialCommand, { action: 'export' | 'erase' }>, originalBytes: string,
  actor: MaterialActor, rpc: MaterialRPC, signal: AbortSignal, current: () => Promise<boolean>, now = Date.now): Promise<MaterialBundle> {
  if (command.action !== 'export') fail();
  const invoke = async (action: string, bytes: string) => {
    if (signal.aborted || !await current()) fail();
    const result = await rpc(action, bytes, signal);
    if (signal.aborted || !await current()) fail();
    if (Buffer.byteLength(JSON.stringify(result) ?? '', 'utf8') > MATERIAL_LIMITS.maxBytes) fail();
    return result;
  };
  const start = await invoke('export_start', originalBytes); const digest = materialDigest(originalBytes);
  if (!record(start) || !exact(start, [...materialBindingKeys,'kind','requestDigest','limits']) || !validMaterialBinding(start, now())
    || !sameMaterialSelection(start, command, actor) || start.kind !== 'started' || start.requestDigest !== digest || start.previewDigest !== command.previewDigest
    || !record(start.limits) || !exact(start.limits, ['pageSize','maxPages','maxRows','maxBytes'])
    || !['pageSize','maxPages','maxRows','maxBytes'].every(k => start.limits && record(start.limits) && start.limits[k] === MATERIAL_LIMITS[k as keyof typeof MATERIAL_LIMITS])) fail();
  const binding = Object.fromEntries(materialBindingKeys.map(k => [k,start[k]])) as MaterialBinding;
  const input = { scope: command.scope, requestId: command.requestId, tripId: command.tripId, objectIds: command.objectIds,
    sourceDigest: binding.sourceDigest, previewDigest: binding.previewDigest };
  const items: unknown[] = []; let pages = 0; let cursor: unknown = null;
  for (;;) {
    if (now() >= binding.expiresAt || pages >= MATERIAL_LIMITS.maxPages) fail();
    const page = await invoke('page', JSON.stringify({ action: 'page', ...input, cursor, limit: MATERIAL_LIMITS.pageSize }));
    if (!record(page) || !exact(page, [...materialBindingKeys,'kind','requestDigest','items','hasMore','nextCursor','sectionComplete','pageNumber'])
      || !validMaterialBinding(page, now()) || !sameMaterialBinding(page, binding) || page.kind !== 'page' || page.requestDigest !== digest
      || !Array.isArray(page.items) || page.items.length < 1 || page.items.length > MATERIAL_LIMITS.pageSize
      || typeof page.hasMore !== 'boolean' || page.sectionComplete !== !page.hasMore || page.pageNumber !== pages + 1) fail();
    for (const row of page.items) {
      const key = materialRowKey(command.scope, row, command.tripId, actor.mobileEpoch, now());
      if (key !== command.objectIds[items.length]) fail(); items.push(row);
    }
    if (items.length > MATERIAL_LIMITS.maxRows || Buffer.byteLength(JSON.stringify({ ...binding, items }), 'utf8') > MATERIAL_LIMITS.maxBytes) fail();
    pages++;
    if (page.hasMore) {
      if (page.items.length !== MATERIAL_LIMITS.pageSize || items.length >= command.objectIds.length
        || !record(page.nextCursor) || !exact(page.nextCursor, ['sourceDigest','afterId'])
        || page.nextCursor.sourceDigest !== binding.sourceDigest || page.nextCursor.afterId !== command.objectIds[items.length - 1]) fail();
      cursor = page.nextCursor;
    } else { if (page.nextCursor !== null || items.length !== command.objectIds.length) fail(); break; }
  }
  const proof = await invoke('proof', JSON.stringify({ action: 'proof', ...input }));
  if (!record(proof) || !exact(proof, [...materialBindingKeys,'kind','requestDigest','coverage','pages','rows']) || !validMaterialBinding(proof, now())
    || !sameMaterialBinding(proof, binding) || proof.kind !== 'proof' || proof.requestDigest !== digest
    || proof.coverage !== 'complete' || proof.pages !== pages || proof.rows !== items.length) fail();
  const bundle: MaterialBundle = { ...binding, kind: 'bundle', requestDigest: digest, items, proof: { coverage: 'complete', pages, rows: items.length } };
  if (!decodeMaterialBundle(bundle, command, actor, now())) fail();
  return bundle;
}
