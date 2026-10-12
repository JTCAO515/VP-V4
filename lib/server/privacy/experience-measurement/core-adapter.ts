import type { ProfileDomainRPC } from './export.ts';
import type { CoreRecoveryAdapter, RecoveryContext, RecoveryFrame } from './recovery.ts';
/** Existing protected operator/Core runtime must supply these verifiers from
 * its authenticated source transport. They are NOT RPC response flags, config
 * booleans, caller journal fields or newly created signing credentials. No
 * implementation is installed in the current Core source. */
export type ProtectedOriginalSource = Readonly<{
  verifyOrigin(context: RecoveryContext, signal: AbortSignal): Promise<boolean>;
  verifySeal(context: RecoveryContext, frame: RecoveryFrame, signal: AbortSignal): Promise<boolean>;
}>;
export const CORE_RECOVERY_ACTIONS = ['measurement_recovery_context', 'measurement_recovery_issue',
  'measurement_recovery_current', 'measurement_recovery_reconcile'] as const;
/** Concrete bridge over the ORIGINAL privacy_core_export_v1 domain port. This
 * does not create a credential/transport/D2 engine or grant new Core actions.
 * Matching old-Core dispatch and independent verifiers require exact shared
 * leases. Current Core rejects/uninstalls these candidate actions: acquisition
 * catches that denial. A missing protected-source verifier yields no adapter. */
export function measurementCoreRecoveryAdapter(domain: ProfileDomainRPC | null, source: ProtectedOriginalSource | null): CoreRecoveryAdapter | null {
  if (!domain || !source || typeof source.verifyOrigin !== 'function' || typeof source.verifySeal !== 'function') return null;
  return {
    open: (requestId, signal) => domain('measurement_recovery_context', { requestId }, signal),
    issue: (request, signal) => domain('measurement_recovery_issue', { ...request }, signal),
    current: (context, signal) => domain('measurement_recovery_current', {
      requestId: context.requestId, leaseId: context.leaseId, generation: context.generation,
    }, signal),
    async authenticate(context, frame, signal) {
      if (signal.aborted || context.source.instanceId === context.targetInstanceId) return false;
      return await source.verifyOrigin(structuredClone(context), signal) && !signal.aborted
        && await source.verifySeal(structuredClone(context), structuredClone(frame), signal) && !signal.aborted;
    },
    reconcile: (context, frame, signal) => domain('measurement_recovery_reconcile', {
      requestId: context.requestId, leaseId: context.leaseId, generation: context.generation,
      acquisitionId: frame.acquisitionId, journalId: frame.journalId, frame: structuredClone(frame),
    }, signal),
  };
}
