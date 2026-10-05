import { exact, record } from '../../guide/contract.ts';
import { COVERAGE_PROGRESS_LIMITS, coverageProgressBindingKeys, validCoverageProgressBinding, sameCoverageProgressSelection, coverageProgressDigest, type CoverageProgressActor,
  type CoverageProgressBinding, type CoverageProgressCommand } from './contract.ts';
import { coverageProgressRowKey } from './rows.ts';
import { sameCoverageProgressBinding, decodeCoverageProgressBundle, type CoverageProgressBundle } from './protocol.ts';

export type CoverageProgressRPC = (action: string, originalBytes: string, signal: AbortSignal) => Promise<unknown>;
function fail(): never { throw Error('COVERAGE_PROGRESS_SOURCE_UNAVAILABLE'); }
export async function collectCoverageProgressExport(command: Extract<CoverageProgressCommand, { action: 'export' | 'erase' }>, originalBytes: string,
  actor: CoverageProgressActor, rpc: CoverageProgressRPC, signal: AbortSignal, current: () => Promise<boolean>, now = Date.now): Promise<CoverageProgressBundle> {
  if (command.action !== 'export') fail();
  const invoke = async (action: string, bytes: string) => {
    if (signal.aborted || !await current()) fail();
    const result = await rpc(action, bytes, signal);
    if (signal.aborted || !await current()) fail();
    if (Buffer.byteLength(JSON.stringify(result) ?? '', 'utf8') > COVERAGE_PROGRESS_LIMITS.maxBytes) fail();
    return result;
  };
  const start = await invoke('export_start', originalBytes); const digest = coverageProgressDigest(originalBytes);
  if (!record(start) || !exact(start, [...coverageProgressBindingKeys,'kind','requestDigest','limits']) || !validCoverageProgressBinding(start, now())
    || !sameCoverageProgressSelection(start, command, actor) || start.kind !== 'started' || start.requestDigest !== digest || start.previewDigest !== command.previewDigest
    || !record(start.limits) || !exact(start.limits, ['pageSize','maxPages','maxRows','maxBytes'])
    || !['pageSize','maxPages','maxRows','maxBytes'].every(k => start.limits && record(start.limits) && start.limits[k] === COVERAGE_PROGRESS_LIMITS[k as keyof typeof COVERAGE_PROGRESS_LIMITS])) fail();
  const binding = Object.fromEntries(coverageProgressBindingKeys.map(k => [k,start[k]])) as CoverageProgressBinding;
  const input = { scope: command.scope, requestId: command.requestId, objectIds: command.objectIds,
    sourceDigest: binding.sourceDigest, previewDigest: binding.previewDigest };
  const items: unknown[] = []; let pages = 0; let cursor: unknown = null;
  for (;;) {
    if (now() >= binding.expiresAt || pages >= COVERAGE_PROGRESS_LIMITS.maxPages) fail();
    const page = await invoke('page', JSON.stringify({ action: 'page', ...input, cursor, limit: COVERAGE_PROGRESS_LIMITS.pageSize }));
    if (!record(page) || !exact(page, [...coverageProgressBindingKeys,'kind','requestDigest','items','hasMore','nextCursor','sectionComplete','pageNumber'])
      || !validCoverageProgressBinding(page, now()) || !sameCoverageProgressBinding(page, binding) || page.kind !== 'page' || page.requestDigest !== digest
      || !Array.isArray(page.items) || page.items.length < 1 || page.items.length > COVERAGE_PROGRESS_LIMITS.pageSize
      || typeof page.hasMore !== 'boolean' || page.sectionComplete !== !page.hasMore || page.pageNumber !== pages + 1) fail();
    for (const row of page.items) {
      const key = coverageProgressRowKey(row, binding);
      if (key !== command.objectIds[items.length]) fail(); items.push(row);
    }
    if (items.length > COVERAGE_PROGRESS_LIMITS.maxRows || Buffer.byteLength(JSON.stringify({ ...binding, items }), 'utf8') > COVERAGE_PROGRESS_LIMITS.maxBytes) fail();
    pages++;
    if (page.hasMore) {
      if (page.items.length !== COVERAGE_PROGRESS_LIMITS.pageSize || items.length >= command.objectIds.length
        || !record(page.nextCursor) || !exact(page.nextCursor, ['sourceDigest','afterId'])
        || page.nextCursor.sourceDigest !== binding.sourceDigest || page.nextCursor.afterId !== command.objectIds[items.length - 1]) fail();
      cursor = page.nextCursor;
    } else { if (page.nextCursor !== null || items.length !== command.objectIds.length) fail(); break; }
  }
  const proof = await invoke('proof', JSON.stringify({ action: 'proof', ...input }));
  if (!record(proof) || !exact(proof, [...coverageProgressBindingKeys,'kind','requestDigest','coverage','pages','rows']) || !validCoverageProgressBinding(proof, now())
    || !sameCoverageProgressBinding(proof, binding) || proof.kind !== 'proof' || proof.requestDigest !== digest
    || proof.coverage !== 'complete' || proof.pages !== pages || proof.rows !== items.length) fail();
  const bundle: CoverageProgressBundle = { ...binding, kind: 'bundle', requestDigest: digest, items, proof: { coverage: 'complete', pages, rows: items.length } };
  if (!decodeCoverageProgressBundle(bundle, command, actor, now())) fail();
  return bundle;
}
