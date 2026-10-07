import { createHash } from 'node:crypto';
import { exportCanonical } from '../../../../lib/server/privacy/export-dispatcher.ts';

export const owner = '00000000-0000-0000-0000-000000000001';
const op = '00000000-0000-0000-0000-000000000002';
export const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
export const now = () => Date.now();
export const lease = () => ({ requestId: id(3), ownerId: owner, leaseId: id(4), generation: 1, expiresAt: new Date(now()+60000).toISOString() });
export const profile = () => ({ ownerId: owner,
  profile: { displayName: '😀'.repeat(80), travelPace: 'packed', locale: 'en', currency: 'USD', distanceUnit: 'mile',
    temperatureUnit: 'fahrenheit', defaultDepartureTime: '08:31:02.123456', paceNotice: 'local-planning-cross-trip-v1',
    paceOperation: op, paceRequest: { action: 'save', operationId: op, expectedRevision: 4, travelPace: 'packed', noticeVersion: 'local-planning-cross-trip-v1' },
    paceUndo: { travelPace: 'relaxed', state: 'explicit', noticeVersion: 'local-planning-cross-trip-v1' } },
  summary: { profileRevision: 8, paceRevision: 5, profileErasureFloor: 3, paceErasureFloor: 2, paceState: 'explicit',
    presentFields: ['display_name','travel_pace','locale','currency','distance_unit','temperature_unit','default_departure_time','pace_notice','pace_operation','pace_request','pace_undo'], hasPaceRequest: true, hasPaceUndo: true },
  savedFields: ['display_name','travel_pace','locale','currency','distance_unit','temperature_unit','default_departure_time'],
  createdAt: '2026-10-01T01:00:00.000Z', updatedAt: '2026-10-07T01:00:00.000Z' });
export const watermark = () => ({ ownerId: owner, profileRevision: 8, paceRevision: 5, profileErasureFloor: 3, paceErasureFloor: 2 });
export const operation = n => ({ requestId:id(n),ownerId:owner,sessionId:id(8),mobileEpoch:1,scope:'profile-sensitive-data/1',profileId:owner,objectIds:[],
  sourceDigest:'b'.repeat(64),previewDigest:'c'.repeat(64),capturedAt:Date.parse('2026-10-01T01:00:00Z'),expiresAt:Date.parse('2026-10-01T01:00:00Z')+30000,
  requestDigest:null,state:'previewed',previewErased:true,summary:null,copies:null,conflicts:null,decision:null });
export const snapshot = () => ({ownerId:owner,profile:profile(),watermark:watermark(),operations:[operation(10),operation(11)],sourceRows:{profiles:1,watermarks:1,operations:2}});
export const page = (item=snapshot()) => ({schemaVersion:'profile-core-export/1',section:'snapshot',
  sourceDigest:createHash('sha256').update(exportCanonical({snapshot:[item]}),'utf8').digest('hex'),items:[item],hasMore:false,nextCursor:null,sectionComplete:true});
