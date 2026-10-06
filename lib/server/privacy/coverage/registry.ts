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
import { ownerModuleExportHTTP } from './module-export.ts';
import { materialReferenceNativeHTTP } from '../material-references/http.ts';
import { materialCoverageRequestBody } from '../material-references/coverage.ts';
import { coverageProgressNativeHTTP } from '../coverage-progress/http.ts';
import { coverageProgressCoverageRequestBody } from '../coverage-progress/coverage.ts';
import { archiveDataNativeHTTP } from '../archive-data/http.ts';
import { archiveCoverageRequestBody } from '../archive-data/coverage.ts';
import { conversationDataNativeHTTP } from '../conversation-data/http.ts';
import { conversationCoverageRequestBody } from '../conversation-data/coverage.ts';
import { notificationDataNativeHTTP } from '../notification-data/http.ts';
import { notificationDataCoverageRequestBody } from '../notification-data/coverage.ts';

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
  notifications: request => ownerModuleExportHTTP(request, 'notification-metadata/1'),
  lifecycle: request => ownerModuleExportHTTP(request, 'trip-lifecycle-metadata/1'),
  materials: request => materialReferenceNativeHTTP(request),
  coverage_progress: request => coverageProgressNativeHTTP(request),
  notification_data: request => notificationDataNativeHTTP(request),
  archive_data: request => archiveDataNativeHTTP(request),
  conversation_data: request => conversationDataNativeHTTP(request),
};
const paths: Readonly<Record<string, string>> = {
  core: '/api/privacy/native/v1/exports', trip: '/api/privacy/native/v1/trips',
  linked_trip: '/api/privacy/native/v1/linked-trips', memory: '/api/privacy/native/v1/memories/delete',
  brief: '/api/service-cases/native/brief/v1', case: '/api/service-cases/native/data/v1',
  ugc: '/api/community/native/v1', safety: '/api/community/safety/native/v1', publication: '/api/community/publication/native/v1',
  notifications: '/api/privacy/native/v1/coverage/module-export', lifecycle: '/api/privacy/native/v1/coverage/module-export',
  materials: '/api/privacy/native/v1/material-references',
  coverage_progress: '/api/privacy/native/v1/coverage-progress',
  notification_data: '/api/privacy/native/v1/notification-data',
  archive_data: '/api/privacy/native/v1/archive-data',
  conversation_data: '/api/privacy/native/v1/conversation-data',
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
    else if (handler === 'materials') body = materialCoverageRequestBody(input);
    else if (handler === 'coverage_progress') body = coverageProgressCoverageRequestBody(input);
    else if (handler === 'notification_data') body = notificationDataCoverageRequestBody(input);
    else if (handler === 'archive_data') body = archiveCoverageRequestBody(input);
    else if (handler === 'conversation_data') body = conversationCoverageRequestBody(input);
    else throw Error('RECOVERY_NOT_IMPLEMENTED');
  }
  return new NextRequest(url, { method, headers, signal, ...(method === 'POST' ? { body } : {}) });
}
