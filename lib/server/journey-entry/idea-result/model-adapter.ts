import { runPlanningV2ModelStep, type PlanningV2ModelStepInput, type PlanningV2ModelStepPorts } from '../../turn/planning-v2-model-step.ts';
import { captureIdeaResultSource, matchesIdeaResultSource } from './source.ts';

export type IdeaResultModelInput = Omit<PlanningV2ModelStepInput, 'prompt'> & Readonly<{ observation: unknown; observedNow: number }>;

/** Reuses the original producer, effect authority, immutable attempt binding,
 * destination journal, usage receipt and budget. No scheduler or new attempt.
 * Caller owns an existing lease and execution profile before entering here. */
export async function runIdeaResultModel(input: IdeaResultModelInput, ports: PlanningV2ModelStepPorts, signal: AbortSignal) {
  if (input.enabled !== true) return { kind: 'disabled' } as const;
  if (signal.aborted) return { kind: 'blocked' } as const;
  const capturedInput = structuredClone(input);
  try {
    const raw = await ports.read(capturedInput.lease, signal);
    if (signal.aborted) return { kind: 'blocked' } as const;
    const source = captureIdeaResultSource(raw, capturedInput.lease, capturedInput.observation, capturedInput.observedNow);
    if (!source) return { kind: 'blocked' } as const;
    const pinned: PlanningV2ModelStepPorts = { ...ports, read: async (lease, s) => {
      const current = await ports.read(lease, s);
      return !s.aborted && matchesIdeaResultSource(current, source) ? current : null;
    } };
    const result = await runPlanningV2ModelStep({ enabled: true, lease: source.lease, binding: capturedInput.binding,
      reservedMicros: capturedInput.reservedMicros, timeoutMs: capturedInput.timeoutMs,
      maxOutputTokens: capturedInput.maxOutputTokens, prompt: source.prompt }, pinned, signal);
    // A settled historical attempt remains accounted for, but may not become a
    // current result after source replacement. Never retry it to obtain a value.
    if (result.kind !== 'settled') return result;
    let current: unknown;
    try { current = await ports.read(source.lease, signal); }
    catch { return { kind: 'stale', output: result.output } as const; }
    if (signal.aborted || !matchesIdeaResultSource(current, source)) return { kind: 'stale', output: result.output } as const;
    return { kind: 'settled', output: result.output, source } as const;
  } catch { return { kind: 'blocked' } as const; }
}
