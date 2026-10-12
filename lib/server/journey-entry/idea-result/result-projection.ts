import { validPlanningV2PreparedProjection } from '../../turn/planning-intake-worker-protocol.ts';
import { parsePlanningV2ModelOutputReceipt } from '../../turn/planning-v2-model-output-receipt.ts';
import type { PlanningV2ModelRequestBinding } from '../../turn/planning-v2-model-request.ts';
import type { ComparisonContent } from '../../artifacts/result-contract.ts';
import { validatesQualifiedIntakeComparison } from '../../artifacts/qualified-intake-comparison.ts';
import { captureIdeaResultSource, sameIdeaSource, type IdeaResultSource } from './source.ts';

export type IdeaResultProjection = Readonly<{
  schemaVersion: 'journey-idea-result-projection/1';
  source: IdeaResultSource;
  content: ComparisonContent;
  selection: 'jingan' | 'peoples_square' | 'none';
  outputDigest: string;
  usageDigest: string;
  readyForPublication: false;
}>;

/** Model selection affects the actual order of existing factual options. It
 * cannot fabricate a hotel recommendation, date feasibility or group suitability.
 * The existing SQL publisher must separately accept this exact construction. */
export function projectIdeaResult(source: IdeaResultSource, prepared: unknown, rawOutput: unknown,
  expected: PlanningV2ModelRequestBinding, now: number): IdeaResultProjection | null {
  const recaptured = captureIdeaResultSource(source.read, source.lease, source.observation, now);
  if (!recaptured || !sameIdeaSource(recaptured, source)
    || !validPlanningV2PreparedProjection(prepared, source.read, source.lease, source.observation, now)) return null;
  if (!validatesQualifiedIntakeComparison(prepared.content, source.read.qualifiedIntake,
    { ...source.lease.source, contextDigest: source.lease.intakeContextDigest }, source.observation,
    source.lease.locale, now, source.lease.environment)) return null;
  const l = source.lease;
  // A recovered settled output keeps its original attempt lease. The existing
  // SQL publisher qualifies that original attempt against the current work lease.
  if (expected.owner !== l.ownerId || expected.task !== l.taskId || expected.turn !== l.turnId
    || expected.planningPolicy !== l.planningPolicyId || expected.intakeDigest !== l.intakeContextDigest || expected.planningDigest !== l.planningContextDigest) return null;
  const output = parsePlanningV2ModelOutputReceipt(rawOutput, expected);
  if (!output) return null;
  const factual = structuredClone(prepared.content) as ComparisonContent;
  const selection = output.output.highlight;
  const content: ComparisonContent = { ...factual, options: selection === 'none' ? factual.options
    : [...factual.options].sort((a, b) => Number(b.id === selection) - Number(a.id === selection)) };
  return structuredClone({ schemaVersion: 'journey-idea-result-projection/1', source, content, selection,
    outputDigest: output.outputDigest, usageDigest: output.usageDigest, readyForPublication: false });
}
