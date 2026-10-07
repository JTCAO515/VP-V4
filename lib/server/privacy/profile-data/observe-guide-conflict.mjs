// Own diagnostic observer: original Guide test/HTTP/RPC/assert/timing calls stay intact.
// Captures only the response error of the existing changed played-position call.
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const original = globalThis.fetch;
const output = '/tmp/vpj58-guide-played-conflict-observation.json';
const safeMessage = value => typeof value === 'string' ? value.split('\n')[0].slice(0, 300) : null;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const bodyText = typeof init?.body === 'string' ? init.body : null;
  let body; try { body = bodyText === null ? null : JSON.parse(bodyText); } catch { body = null; }
  const command = url?.endsWith('/rest/v1/rpc/guide_place_v1') ? body?.p_input : body;
  const watched = process.env.VP_GUIDE_HTTP_INTEGRATION === 'true' && command?.action === 'follow_up'
    && Array.isArray(command.completedSegmentIds) && command.completedSegmentIds.length === 0
    && (url?.startsWith(process.env.VP_IDENTITY_SUPABASE_API_URL + '/rest/v1/rpc/guide_place_v1')
      || /^http:\/\/127\.0\.0\.1:\d+\/api\/guide\/native\/v1\/trips\/[0-9a-f-]+$/.test(url ?? ''));
  const response = await original(input, init);
  if (watched) {
    try {
      const value = await response.clone().json();
      const fingerprint = createHash('sha256').update(JSON.stringify(command)).digest('hex');
      const observation = { kind: 'unmodified original changed played-position request response',
        commandFingerprint: fingerprint, process: url.includes('/rest/v1/') ? 'owner_pg_rpc' : 'native_http', status: response.status,
        sqlstate: typeof value?.code === 'string' ? value.code : null,
        message: safeMessage(value?.message), errorCode: typeof value?.error?.code === 'string' ? value.error.code : null,
        originalRequestForwarded: true, sourceOrOracleChanged: false, rawRequestHeadersOrBodyLogged: false };
      if (observation.process === 'native_http') {
        try {
          const pg = JSON.parse(readFileSync(output + '.' + fingerprint + '.owner_pg_rpc', 'utf8'));
          if (pg.commandFingerprint === fingerprint) observation.ownerPG = pg;
        } catch { observation.ownerPGObserved = false; }
      }
      writeFileSync(output + '.' + fingerprint + '.' + observation.process, JSON.stringify(observation, null, 2) + '\n', { mode: 0o600 });
      console.log('VP_GUIDE_PLAYED_CONFLICT_OBSERVATION ' + JSON.stringify(observation));
    } catch {
      // Diagnostic I/O/logging failure cannot manufacture a different HTTP/PG
      // result. Original fetch/network/business failures remain outside this catch.
      try { console.log('VP_GUIDE_PLAYED_CONFLICT_OBSERVATION ' + JSON.stringify({ observationUnavailable: true, phase: 'diagnostic_capture_or_output', originalResponseReturned: true, sourceOrOracleChanged: false })); } catch { /* telemetry is best-effort only */ }
    }
  }
  return response;
};
