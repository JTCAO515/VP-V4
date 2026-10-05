import { NextRequest } from 'next/server.js';
import { coreExportHTTP } from '../export-http.ts';
import { tripDeletionHTTP } from '../trip-deletion-http.ts';
import { linkedTripDeletionHTTP } from '../linked-trip/http.ts';
import { memoryDeletionHTTP } from '../memory-delete/http.ts';
import { travelerBriefNativeHTTP } from '../../service-cases/brief/native-http.ts';
import { serviceDataNativeHTTP } from '../../service-cases/operations/data-http.ts';
import { communityNativeHTTP } from '../../community/native-http.ts';
import { safetyNativeHTTP } from '../../community/safety/native-http.ts';
import { publicationNativeHTTP } from '../../community/publication/native-http.ts';
import { guideHTTP } from '../../guide/http.ts';
import type { SelectedCommand } from './contract.ts';

export type OwnerHandler = (request: NextRequest, selected: SelectedCommand) => Promise<Response>;
/** Real direct calls to existing owner boundaries, never a service-role or arbitrary RPC dispatch. */
export const OWNER_HANDLERS: Readonly<Record<string, OwnerHandler>> = {
  core: (request, selected) => coreExportHTTP(request, selected.input.phase === 'recover' ? 'read' : 'request'),
  trip: request => tripDeletionHTTP(request),
  linked_trip: request => linkedTripDeletionHTTP(request),
  memory: request => memoryDeletionHTTP(request),
  brief: request => travelerBriefNativeHTTP(request),
  case: request => serviceDataNativeHTTP(request),
  ugc: request => communityNativeHTTP(request),
  safety: request => safetyNativeHTTP(request),
  publication: request => publicationNativeHTTP(request),
  guide: (request, selected) => guideHTTP(request, selected.input.tripId!, true),
};
const paths: Readonly<Record<string, string>> = {
  core: '/api/privacy/native/v1/exports', trip: '/api/privacy/native/v1/trips',
  linked_trip: '/api/privacy/native/v1/linked-trips', memory: '/api/privacy/native/v1/memories/delete',
  brief: '/api/service-cases/native/brief/v1', case: '/api/service-cases/native/data/v1',
  ugc: '/api/community/native/v1', safety: '/api/community/safety/native/v1', publication: '/api/community/publication/native/v1',
};
export function ownerHandlerRequest(request: Request, selected: SelectedCommand, signal: AbortSignal): NextRequest {
  const { input, handler } = selected; if (!handler || !Object.hasOwn(OWNER_HANDLERS, handler)) throw Error('HANDLER_MISSING');
  const url = new URL(request.url); url.pathname = handler === 'guide' ? `/api/guide/native/v1/trips/${input.tripId}` : paths[handler]; url.search = '';
  const headers = new Headers(request.headers); headers.delete('content-length'); headers.set('content-type', 'application/json');
  for (const prefix of ['community','community-safety','community-publication']) {
    headers.set(`x-${prefix}-expected-actor`, input.actorId); headers.set(`x-${prefix}-expected-session`, input.sessionId);
  }
  let body = input.commandBytes; let method = 'POST';
  if (input.phase === 'recover') {
    if (['core','trip','linked_trip','memory'].includes(handler)) { method = 'GET'; url.searchParams.set('requestId', input.operationId); }
    else if (['ugc','safety','publication'].includes(handler)) body = JSON.stringify({ action: 'operation', operationId: input.operationId, mutationBytes: input.commandBytes });
    else if (['brief','case'].includes(handler)) body = JSON.stringify({ action: 'read_operation', operationId: input.operationId });
    else throw Error('RECOVERY_NOT_IMPLEMENTED');
  }
  return new NextRequest(url, { method, headers, signal, ...(method === 'POST' ? { body } : {}) });
}
