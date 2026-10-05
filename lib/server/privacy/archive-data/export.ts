import { exact, record } from '../../guide/contract.ts';
import { ARCHIVE_LIMITS, archiveBindingKeys, validArchiveBinding, sameArchiveSelection, archiveDigest, sectionsFor,
  type ArchiveActor, type ArchiveBinding, type ArchiveCommand } from './contract.ts';
import { archiveRowKey, archiveCursor } from './rows.ts';
import { sameArchiveBinding, decodeArchiveBundle, type ArchiveBundle } from './protocol.ts';

export type ArchiveRPC = (action: string, originalBytes: string, signal: AbortSignal) => Promise<unknown>;
function fail(): never { throw Error('ARCHIVE_SOURCE_UNAVAILABLE'); }
export async function collectArchiveExport(command: Extract<ArchiveCommand, { action: 'export' | 'erase' | 'validate' }>, originalBytes: string,
  actor: ArchiveActor, rpc: ArchiveRPC, signal: AbortSignal, current: () => Promise<boolean>, now = Date.now): Promise<ArchiveBundle> {
  if (command.action !== 'export') fail();
  const invoke = async (action: string, bytes: string) => {
    if (signal.aborted || !await current()) fail();
    const result = await rpc(action, bytes, signal);
    if (signal.aborted || !await current()) fail();
    if (Buffer.byteLength(JSON.stringify(result) ?? '', 'utf8') > ARCHIVE_LIMITS.maxBytes) fail();
    return result;
  };
  const start = await invoke('export_start', originalBytes); const digest = archiveDigest(originalBytes);
  const expectedSections = sectionsFor(command.scope);
  if (!record(start) || !exact(start, [...archiveBindingKeys,'kind','requestDigest','sections','limits']) || !validArchiveBinding(start, now())
    || !sameArchiveSelection(start, command, actor) || start.kind !== 'started' || start.requestDigest !== digest || start.previewDigest !== command.previewDigest
    || JSON.stringify(start.sections) !== JSON.stringify(expectedSections) || !record(start.limits) || !exact(start.limits, ['pageSize','maxPages','maxRows','maxBytes'])
    || !['pageSize','maxPages','maxRows','maxBytes'].every(k => record(start.limits) && start.limits[k] === ARCHIVE_LIMITS[k as keyof typeof ARCHIVE_LIMITS])) fail();
  const binding = Object.fromEntries(archiveBindingKeys.map(k => [k,start[k]])) as ArchiveBinding;
  const input = { scope: command.scope, requestId: command.requestId, tripId: command.tripId, tripVersion: command.tripVersion, objectIds: command.objectIds,
    sourceDigest: binding.sourceDigest, previewDigest: binding.previewDigest };
  const sections: { section: string; items: unknown[] }[] = []; let pages = 0; let rows = 0;
  for (const section of expectedSections) {
    const items: unknown[] = []; let cursor: unknown = null; let sectionPages = 0; let last = '';
    for (;;) {
      if (now() >= binding.expiresAt || pages >= ARCHIVE_LIMITS.maxPages || sectionPages >= 201) fail();
      const page = await invoke('page', JSON.stringify({ action: 'page', ...input, section, cursor, limit: ARCHIVE_LIMITS.pageSize }));
      if (!record(page) || !exact(page, [...archiveBindingKeys,'kind','requestDigest','section','items','hasMore','nextCursor','sectionComplete','pageNumber'])
        || !validArchiveBinding(page, now()) || !sameArchiveBinding(page, binding) || page.kind !== 'page' || page.requestDigest !== digest || page.section !== section
        || !Array.isArray(page.items) || page.items.length > ARCHIVE_LIMITS.pageSize || typeof page.hasMore !== 'boolean'
        || page.sectionComplete !== !page.hasMore || page.pageNumber !== sectionPages + 1) fail();
      for (const row of page.items) {
        const key = archiveRowKey(section, row, binding);
        if (!key || key <= last || section === 'progress' && key !== command.objectIds[items.length]) fail();
        last = key; items.push(row); rows++;
      }
      pages++; sectionPages++;
      if (items.length > (section === 'trip' ? 1 : section === 'progress' ? ARCHIVE_LIMITS.selected : 10000) || rows > ARCHIVE_LIMITS.maxRows
        || Buffer.byteLength(JSON.stringify({ ...binding, sections: [...sections, { section, items }] }), 'utf8') > ARCHIVE_LIMITS.maxBytes) fail();
      if (page.hasMore) {
        if (page.items.length !== ARCHIVE_LIMITS.pageSize || !record(page.nextCursor) || !archiveCursor(page.nextCursor, section, binding.sourceDigest)
          || page.nextCursor.afterKey !== last) fail();
        cursor = page.nextCursor;
      } else { if (page.nextCursor !== null) fail(); break; }
    }
    sections.push({ section, items });
  }
  const proof = await invoke('proof', JSON.stringify({ action: 'proof', ...input }));
  if (!record(proof) || !exact(proof, [...archiveBindingKeys,'kind','requestDigest','coverage','pages','rows']) || !validArchiveBinding(proof, now())
    || !sameArchiveBinding(proof, binding) || proof.kind !== 'proof' || proof.requestDigest !== digest || proof.coverage !== 'complete' || proof.pages !== pages || proof.rows !== rows) fail();
  const bundle: ArchiveBundle = { ...binding, kind: 'bundle', requestDigest: digest, sections, proof: { coverage: 'complete', pages, rows } };
  if (!decodeArchiveBundle(bundle, command, actor, now())) fail();
  return bundle;
}
