import { exact, record } from '../../guide/contract.ts';
import { parseCoverageInput, coverageResult, type CoverageResult } from './contract.ts';
import { classifyOriginal } from './outcomes.ts';
import { MODULE_CATALOG, CATALOG_VERSION } from './catalog.ts';
import type { CoverageActor } from './http.ts';

/** Check exact selection, catalog and source contract again at the consuming boundary. */
export function matchesCoverageResult(value: unknown, raw: string, now = Date.now()): value is CoverageResult {
  let input: unknown; try { input = JSON.parse(raw); } catch { return false; }
  const selected = parseCoverageInput(input); if (!selected || !record(value)) return false;
  const expected = coverageResult(selected.input, raw, 'unknown', 'NONE');
  if (!exact(value, Object.keys(expected)) || !Object.entries(expected).every(([key, v]) =>
    ['state','reason','result'].includes(key) || value[key] === v)
    || typeof value.reason !== 'string' || !/^[A-Za-z0-9_]{1,120}$/.test(value.reason)) return false;
  if (value.result === null) return value.reason !== 'NONE' && (value.state === 'unavailable' || value.state === 'unknown' && selected.input.action === 'delete');
  const original = classifyOriginal(selected, value.result, now);
  return !!original && value.state === original.state && value.reason === original.reason;
}

export type ModuleEvidence = Readonly<{ moduleId: string; state: string; reason: string }>;
/** Source-bound runtime result only; unknown/missing modules never disappear from a report. */
export function coverageReport(actor: CoverageActor, action: 'export' | 'delete', receipts: readonly { raw: string; value: unknown }[], now = Date.now()) {
  const modules = MODULE_CATALOG.map(module => {
    const candidates = receipts.filter(r => matchesCoverageResult(r.value, r.raw, now) && r.value.moduleId === module.id
      && r.value.catalogVersion === CATALOG_VERSION && r.value.action === action && r.value.actorId === actor.actorId
      && r.value.sessionId === actor.sessionId && r.value.mobileEpoch === actor.mobileEpoch);
    const latest = candidates.at(-1)?.value as CoverageResult | undefined;
    return { moduleId: module.id, state: latest?.state ?? 'unavailable', reason: latest?.reason ?? 'RUNTIME_UNVERIFIED' };
  });
  return { catalogVersion: CATALOG_VERSION, action, modules, allUserDataCompleted: false as const };
}
