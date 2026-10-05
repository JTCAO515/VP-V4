import type { NextRequest } from 'next/server.js';
import { getNativeRuntimeConfig } from '../../identity/native-config.ts';
import { verifyNativeCredentials } from '../../identity/native-credentials.ts';
import { createNativeTripDataAdapter } from '../../identity/user-data-adapter.ts';
import { nativeFetch } from '../../identity/native-fetch.ts';
import { handleServiceOperations } from './http.ts';
import { record, type ServiceInput, type ServiceProjection, type ServiceProposal } from './contract.ts';

export async function serviceOperationsNativeHTTP(request: NextRequest) {
  const config = getNativeRuntimeConfig(request, 'session');
  const enabled = !!config && !config.environment && !process.env.VERCEL_ENV && process.env.SERVICE_CASE_OPERATIONS_LOCAL === '1';
  const result = await handleServiceOperations(request, { enabled, surface: 'owner', createRpc: lifetime => {
    const transport: typeof fetch = (url, init) => lifetime.run(() => nativeFetch(url, { ...init, signal: init?.signal ? AbortSignal.any([lifetime.signal, init.signal]) : lifetime.signal }));
    let credentials: Awaited<ReturnType<typeof verifyNativeCredentials>>;
    async function tripAdapter() {
      const tripConfig = getNativeRuntimeConfig(request, 'trip', 'trip');
      return tripConfig && !tripConfig.environment ? createNativeTripDataAdapter(request, tripConfig, transport) : null;
    }
    async function proveProposal(ref: ServiceProposal, actor: string) {
      const adapter = await tripAdapter(); if (!adapter) return false;
      const auth = await adapter.authenticated(); if ('error' in auth || auth.data !== actor) return false;
      const pending = await adapter.getPendingProposal(ref.tripId, ref.proposalId);
      const currentness: unknown = 'error' in pending ? null : pending.data;
      // The current adapter returns currentness on the outer read object. Require
      // literal false; an absent flag is not proof of scoped-source eligibility.
      return !('error' in pending) && record(currentness) && currentness.stale === false && pending.data.proposal.id === ref.proposalId && pending.data.proposal.baseTripVersion === ref.baseVersion && pending.data.trip.id === ref.tripId && pending.data.trip.headVersion === ref.baseVersion && !!pending.data.proposal.digest;
    }
    return {
      sessionId() { return credentials?.sessionId ?? null; },
      async authenticate() {
        let unavailable = false;
        credentials = await verifyNativeCredentials(request, config!, transport, () => { unavailable = true; });
        if (unavailable) throw new Error('CASE_UNAVAILABLE');
        if (!credentials) return false;
        const result = await credentials.client.rpc('native_session_v2', { p_action: 'session' }).abortSignal(lifetime.signal);
        if (result.error) { if (!['UNAUTHENTICATED', 'SESSION_REPLACED'].includes(result.error.message)) throw new Error('CASE_UNAVAILABLE'); return false; }
        return result.data?.subject === credentials.subject && result.data?.sessionId === credentials.sessionId ? credentials.subject : false;
      },
      async call(name, params) {
        if (!credentials) return { data: null, error: { message: 'UNAUTHENTICATED' } };
        return credentials.client.rpc(name, params).abortSignal(lifetime.signal);
      },
      async proveOwnerInput(input: ServiceInput, actor: string) {
        if (input.action === 'select_proposal') return proveProposal(input.proposal, actor);
        if (input.action !== 'request' || input.trip.kind === 'unknown') return true;
        const adapter = await tripAdapter(); if (!adapter) return false;
        const auth = await adapter.authenticated(); if ('error' in auth || auth.data !== actor) return false;
        const trip = await adapter.getTrip(input.trip.tripId);
        return !('error' in trip) && trip.data.trip.headVersion === input.trip.headVersion;
      },
      async proveOwnerProjection(projection: ServiceProjection, actor: string) { return projection.proposal === null || proveProposal(projection.proposal, actor); },
    };
  } });
  return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff' } });
}
