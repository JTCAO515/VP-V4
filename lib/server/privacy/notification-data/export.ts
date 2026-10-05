import { exact, record } from '../../guide/contract.ts';
import { NOTIFICATION_DATA_LIMITS, notificationDataBindingKeys, validNotificationDataBinding, sameNotificationDataSelection, notificationDataDigest, type NotificationDataActor,
  type NotificationDataBinding, type NotificationDataCommand } from './contract.ts';
import { notificationDataRowKey } from './rows.ts';
import { sameNotificationDataBinding, decodeNotificationDataBundle, type NotificationDataBundle } from './protocol.ts';

export type NotificationDataRPC = (action: string, originalBytes: string, signal: AbortSignal) => Promise<unknown>;
function fail(): never { throw Error('NOTIFICATION_DATA_SOURCE_UNAVAILABLE'); }
export async function collectNotificationDataExport(command: Extract<NotificationDataCommand, { action: 'export' | 'erase' }>, originalBytes: string,
  actor: NotificationDataActor, rpc: NotificationDataRPC, signal: AbortSignal, current: () => Promise<boolean>, now = Date.now): Promise<NotificationDataBundle> {
  if (command.action !== 'export') fail();
  const invoke = async (action: string, bytes: string) => {
    if (signal.aborted || !await current()) fail();
    const result = await rpc(action, bytes, signal);
    if (signal.aborted || !await current()) fail();
    if (Buffer.byteLength(JSON.stringify(result) ?? '', 'utf8') > NOTIFICATION_DATA_LIMITS.maxBytes) fail();
    return result;
  };
  const start = await invoke('export_start', originalBytes); const digest = notificationDataDigest(originalBytes);
  if (!record(start) || !exact(start, [...notificationDataBindingKeys,'kind','requestDigest','limits']) || !validNotificationDataBinding(start, now())
    || !sameNotificationDataSelection(start, command, actor) || start.kind !== 'started' || start.requestDigest !== digest || start.previewDigest !== command.previewDigest
    || !record(start.limits) || !exact(start.limits, ['pageSize','maxPages','maxRows','maxBytes'])
    || !['pageSize','maxPages','maxRows','maxBytes'].every(k => start.limits && record(start.limits) && start.limits[k] === NOTIFICATION_DATA_LIMITS[k as keyof typeof NOTIFICATION_DATA_LIMITS])) fail();
  const binding = Object.fromEntries(notificationDataBindingKeys.map(k => [k,start[k]])) as NotificationDataBinding;
  const input = { scope: command.scope, requestId: command.requestId, objectIds: command.objectIds,
    sourceDigest: binding.sourceDigest, previewDigest: binding.previewDigest };
  const items: unknown[] = []; let pages = 0; let cursor: unknown = null;
  for (;;) {
    if (now() >= binding.expiresAt || pages >= NOTIFICATION_DATA_LIMITS.maxPages) fail();
    const page = await invoke('page', JSON.stringify({ action: 'page', ...input, cursor, limit: NOTIFICATION_DATA_LIMITS.pageSize }));
    if (!record(page) || !exact(page, [...notificationDataBindingKeys,'kind','requestDigest','items','hasMore','nextCursor','sectionComplete','pageNumber'])
      || !validNotificationDataBinding(page, now()) || !sameNotificationDataBinding(page, binding) || page.kind !== 'page' || page.requestDigest !== digest
      || !Array.isArray(page.items) || page.items.length < 1 || page.items.length > NOTIFICATION_DATA_LIMITS.pageSize
      || typeof page.hasMore !== 'boolean' || page.sectionComplete !== !page.hasMore || page.pageNumber !== pages + 1) fail();
    for (const row of page.items) {
      const key = notificationDataRowKey(row, binding);
      if (key !== command.objectIds[items.length]) fail(); items.push(row);
    }
    if (items.length > NOTIFICATION_DATA_LIMITS.maxRows || Buffer.byteLength(JSON.stringify({ ...binding, items }), 'utf8') > NOTIFICATION_DATA_LIMITS.maxBytes) fail();
    pages++;
    if (page.hasMore) {
      if (page.items.length !== NOTIFICATION_DATA_LIMITS.pageSize || items.length >= command.objectIds.length
        || !record(page.nextCursor) || !exact(page.nextCursor, ['sourceDigest','afterId'])
        || page.nextCursor.sourceDigest !== binding.sourceDigest || page.nextCursor.afterId !== command.objectIds[items.length - 1]) fail();
      cursor = page.nextCursor;
    } else { if (page.nextCursor !== null || items.length !== command.objectIds.length) fail(); break; }
  }
  const proof = await invoke('proof', JSON.stringify({ action: 'proof', ...input }));
  if (!record(proof) || !exact(proof, [...notificationDataBindingKeys,'kind','requestDigest','coverage','pages','rows']) || !validNotificationDataBinding(proof, now())
    || !sameNotificationDataBinding(proof, binding) || proof.kind !== 'proof' || proof.requestDigest !== digest
    || proof.coverage !== 'complete' || proof.pages !== pages || proof.rows !== items.length) fail();
  const bundle: NotificationDataBundle = { ...binding, kind: 'bundle', requestDigest: digest, items, proof: { coverage: 'complete', pages, rows: items.length } };
  if (!decodeNotificationDataBundle(bundle, command, actor, now())) fail();
  return bundle;
}
