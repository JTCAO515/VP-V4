import { turnCoverageOutcome } from '../turn-data/coverage.ts';
import { record, exact, uuid } from '../../guide/contract.ts';
import { isDeepStrictEqual } from 'node:util';
import { decodeGuideOutcome } from '../../guide/projection.ts';
import { parseGuideCommand } from '../../guide/contract.ts';
import { decodeCommunityOutcome, matchesCommunityOutcome, parseCommunityInput } from '../../community/contract.ts';
import { decodeSafetyOutcome, matchesSafetyOutcome, parseSafetyInput } from '../../community/safety/contract.ts';
import { decodePublicationOutcome, matchesPublicationOutcome, parsePublicationInput } from '../../community/publication/contract.ts';
import { decodeBriefDataBundle, decodeBriefReceipt } from '../../service-cases/brief/contract.ts';
import { decodeServiceDataBundle, decodeServiceDataReceipt } from '../../service-cases/operations/data-contract.ts';
import { parseExportJob } from '../export-contract.ts';
import { memoryDeletePlan, memoryDeleteReceipt, selectionEqual } from '../memory-delete/contract.ts';
import { linkedTripPlan, linkedTripReceipt } from '../linked-trip/contract.ts';
import { coverageDigest, type SelectedCommand, type CoverageState } from './contract.ts';
import { decodeModuleExportBundle } from './module-export.ts';
import { materialCoverageOutcome } from '../material-references/coverage.ts';
import { coverageProgressCoverageOutcome } from '../coverage-progress/coverage.ts';
import { archiveCoverageOutcome } from '../archive-data/coverage.ts';
import { conversationCoverageOutcome } from '../conversation-data/coverage.ts';
import { resultCoverageOutcome } from '../result-data/coverage.ts';
import { profileCoverageOutcome } from '../profile-data/coverage.ts';
import { notificationDataCoverageOutcome } from '../notification-data/coverage.ts';

type Outcome = Readonly<{ state: CoverageState; reason: string }>;
const state = (value: CoverageState, reason = 'NONE'): Outcome => ({ state: value, reason });
const instant = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
/** Validity, command correlation and completion are independently checked. */
export function classifyOriginal(selected: SelectedCommand, body: unknown, now = Date.now()): Outcome | null {
  const { input, command, handler } = selected;
  if (!handler || !record(body)) return null;
  const data = Object.hasOwn(body, 'data') ? body.data : body;
  if (handler === 'materials') return materialCoverageOutcome(selected, data, now);
  if (handler === 'coverage_progress') return coverageProgressCoverageOutcome(selected, data, now);
  if (handler === 'notification_data') return notificationDataCoverageOutcome(selected, data, now);
  if (handler === 'archive_data') return archiveCoverageOutcome(selected, data, now);
  if (handler === 'conversation_data') return conversationCoverageOutcome(selected, data, now);
  if (handler === 'result_data') return resultCoverageOutcome(selected, data, now);
  if (handler === 'turn_data') return turnCoverageOutcome(selected, data, now);
  if (handler === 'profile_data') return profileCoverageOutcome(selected, data, now);
  if (handler === 'core') {
    const receipt = parseExportJob(body, input.operationId); if (!receipt) return null;
    if (receipt.state === 'queued' || receipt.state === 'running') return state('queued', 'ORIGINAL_JOB_PENDING');
    if (receipt.state === 'expired' || receipt.state === 'failed') return state('unavailable', 'ORIGINAL_JOB_UNAVAILABLE');
    if (!receipt.artifactExpiresAt || Date.parse(receipt.artifactExpiresAt) <= now) return null;
    const module = receipt.modules.find(m => m.module === input.moduleId);
    if (!module) return null;
    return module.status === 'complete' ? state('partial', 'PROTECTED_DOWNLOAD_REQUIRED') : state('partial', module.reason);
  }
  if (handler === 'trip') {
    if (!record(data) || !exact(data, ['version','requestId','tripId','scope','state','requestedAt','completedAt','allUserDataCompleted','backupErasure','providerErasure','offlineRevocation','exportedFilesRevocable'])
      || data.version !== 1 || data.requestId !== input.operationId || data.tripId !== input.tripId || data.scope !== 'trip-core-v1'
      || data.allUserDataCompleted !== false || data.backupErasure !== 'not_verified' || data.providerErasure !== 'not_performed'
      || data.offlineRevocation !== 'on_reconnect_only' || data.exportedFilesRevocable !== false || !instant(data.requestedAt)) return null;
    return data.state === 'queued' && data.completedAt === null ? state('queued', 'ORIGINAL_JOB_PENDING')
      : data.state === 'completed' && instant(data.completedAt) && Date.parse(String(data.completedAt)) >= Date.parse(String(data.requestedAt)) ? state('scoped_complete') : null;
  }
  if (handler === 'linked_trip') {
    if (input.phase === 'preview') return linkedTripPlan(data) && data.tripId === input.tripId && data.expectedVersion === command.expectedVersion && Date.parse(String(data.expiresAt)) > now ? state('preview', 'EXPLICIT_SELECTION_REQUIRED') : null;
    if (!linkedTripReceipt(data) || data.requestId !== input.operationId || data.tripId !== input.tripId || data.scopeDigest !== command.scopeDigest || data.planId !== command.planId
      || !isDeepStrictEqual(data.selection, command.selection)) return null;
    return state(data.state === 'completed' ? 'scoped_complete' : 'queued', data.state === 'completed' ? 'NONE' : 'ORIGINAL_JOB_PENDING');
  }
  if (handler === 'memory') {
    if (input.phase === 'preview') return memoryDeletePlan(data) && Date.parse(String(data.expiresAt)) > now
      && (JSON.stringify(data.selection.memories.map(m => m.memoryId)) === JSON.stringify([...(command.memoryIds as string[])].sort()) || data.conflicts.includes('SCOPE_TOO_LARGE')) ? state('preview', 'EXPLICIT_SELECTION_REQUIRED') : null;
    if (!memoryDeleteReceipt(data) || data.requestId !== input.operationId || data.planId !== command.planId || data.scopeDigest !== command.scopeDigest || !selectionEqual(data.selection, command.selection)) return null;
    return state(data.state === 'completed' ? 'scoped_complete' : 'queued', data.state === 'completed' ? 'NONE' : 'ORIGINAL_JOB_PENDING');
  }
  if (handler === 'guide') {
    const parsed = parseGuideCommand(command); if (!parsed || !uuid(input.tripId)) return null;
    const outcome = decodeGuideOutcome(data, input.tripId, parsed, now); if (!outcome) return null;
    return outcome.kind === 'unavailable' ? state('unavailable', outcome.reason.toUpperCase())
      : ['export','forgotten'].includes(outcome.kind) ? state('scoped_complete') : null;
  }
  if (handler === 'notifications' || handler === 'lifecycle') {
    const bundle = decodeModuleExportBundle(data, now);
    return bundle && bundle.requestId === input.operationId && bundle.ownerId === input.actorId && bundle.sessionId === input.sessionId
      && bundle.mobileEpoch === input.mobileEpoch && bundle.scope === (handler === 'notifications' ? 'notification-metadata/1' : 'trip-lifecycle-metadata/1') ? state('scoped_complete') : null;
  }
  if (handler === 'brief' || handler === 'case') {
    if (input.action === 'export') {
      const bundle = handler === 'brief' ? decodeBriefDataBundle(data) : decodeServiceDataBundle(data);
      return bundle && bundle.ownerId === input.actorId && bundle.sessionId === input.sessionId && bundle.requestId === input.operationId
        && bundle.expiresAt > now ? state('scoped_complete') : null;
    }
    const rawReceipt = input.phase === 'recover' && record(data) ? data.receipt : data;
    if (rawReceipt === null) return state('unknown', 'ORIGINAL_ACK_ABSENT');
    const receipt = handler === 'brief' ? decodeBriefReceipt(rawReceipt) : decodeServiceDataReceipt(rawReceipt);
    if (!receipt || receipt.operationId !== input.operationId || receipt.requestDigest !== coverageDigest(input.commandBytes)) return null;
    if (handler === 'brief') {
      const brief = decodeBriefReceipt(receipt)!;
      if (brief.action !== 'delete' || brief.caseId !== command.caseId || brief.grantRevision !== command.grantRevision
        || brief.outcome === 'applied' && brief.revision !== Number(command.expectedRevision) + 1) return null;
      return brief.outcome === 'applied' ? state('scoped_complete') : state('partial', 'ORIGINAL_OPERATION_CANCELLED');
    }
    return receipt.outcome === 'deleted' ? state('scoped_complete') : state('partial', 'ORIGINAL_OPERATION_CANCELLED');
  }
  const effective = input.phase === 'recover' ? { action: 'operation', operationId: input.operationId, mutationBytes: input.commandBytes } : command;
  const community = handler === 'ugc' ? decodeCommunityOutcome(data) : null;
  const safety = handler === 'safety' ? decodeSafetyOutcome(data) : null;
  const publication = handler === 'publication' ? decodePublicationOutcome(data) : null;
  const outcome = community ?? safety ?? publication;
  const matches = community ? (() => { const parsed = parseCommunityInput(effective); return parsed && matchesCommunityOutcome(community, parsed, input.actorId, input.sessionId); })()
    : safety ? (() => { const parsed = parseSafetyInput(effective); return parsed && matchesSafetyOutcome(safety, parsed, input.actorId, input.sessionId); })()
      : publication ? (() => { const parsed = parsePublicationInput(effective); return parsed && matchesPublicationOutcome(publication, parsed, input.actorId, input.sessionId); })() : false;
  if (!outcome || !matches) return null;
  if (outcome.kind === 'export' || outcome.kind === 'deleted') return state('scoped_complete');
  if (outcome.kind !== 'operation') return null;
  return outcome.state === 'committed' ? state('scoped_complete') : outcome.state === 'absent'
    ? state('unknown', 'ORIGINAL_ACK_ABSENT') : state('partial', 'ORIGINAL_OPERATION_CANCELLED');
}
