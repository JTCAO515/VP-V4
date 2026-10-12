"""Narrow existing qualified Profile decoder delta; artifact only, no shared write."""
import difflib
import hashlib
import json
from pathlib import Path

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
path=ROOT/'lib/server/privacy/profile-export/contract.ts'
before=path.read_text()
helper="""
/** Owner audit metadata only; never an Ops RPC receipt or authorization. */
function validOpsControlExportRow(v: Record<string, unknown>, owner: string): boolean {
  const common = ['kind', 'ownerId', 'operationId', 'action', 'revision', 'stopRevision', 'appliedAt', 'acknowledgement', 'effect'];
  if (v.kind !== 'ops_control_operation/1' || v.ownerId !== owner || !identifier(v.operationId)
    || !revision(v.revision) || v.revision < 1 || !revision(v.stopRevision) || v.stopRevision > v.revision
    || !instant(v.appliedAt) || v.acknowledgement !== 'applied') return false;
  if (v.action === 'budget_resume') return exact(v, [...common, 'scopeId']) && identifier(v.scopeId)
    && v.effect === 'permits_fresh_budget_authorization';
  if (v.action !== 'set' || !exact(v, [...common, 'scope', 'state']) || !record(v.scope)
    || !exact(v.scope, ['kind', 'key']) || typeof v.scope.key !== 'string') return false;
  const registry: Record<string, readonly string[]> = {
    capability: ['text', 'planning_comparison_v1', 'planning_intake_comparison_v2', 'scoped_trip_edit_v1'],
    provider: ['qwen', 'glm', 'deepseek', 'amap'], city: ['shanghai', 'beijing', 'guangzhou', 'chongqing'],
  };
  return typeof v.scope.kind === 'string' && !!registry[v.scope.kind]?.includes(v.scope.key)
    && ((v.state === 'disabled' && v.effect === 'blocks_new_dispatch')
      || (v.state === 'enabled' && v.effect === 'permits_fresh_authorization'));
}
"""
anchor='/** Closed source projection; no arbitrary row/JSON fallback, client owner, or synthesized defaults. */'
assert before.count(anchor)==1
after=before.replace(anchor,helper+'\n'+anchor)
old="""  let previous = '';
  for (const operation of item.operations) {
    if (!record(operation) || !identifier(operation.requestId) || operation.requestId <= previous || !validOperationRow(operation, owner, now)) return null;
    previous = operation.requestId;
  }"""
new="""  let previous = '', previousOps = '', opsSuffix = false;
  for (const operation of item.operations) {
    if (!record(operation)) return null;
    if (operation.kind === 'ops_control_operation/1') {
      opsSuffix = true;
      if (!validOpsControlExportRow(operation, owner) || !identifier(operation.operationId) || operation.operationId <= previousOps) return null;
      previousOps = operation.operationId;
    } else {
      if (opsSuffix || !identifier(operation.requestId) || operation.requestId <= previous || !validOperationRow(operation, owner, now)) return null;
      previous = operation.requestId;
    }
  }"""
assert after.count(old)==1;after=after.replace(old,new)
folder=OUT/'export-decoder-candidate';folder.mkdir(exist_ok=True)
(folder/'contract.ts.before.txt').write_text(before)
(folder/'contract.ts.after.txt').write_text(after)
(folder/'contract.ts.patch').write_text(''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),
 fromfile=str(path.relative_to(ROOT)),tofile=str(path.relative_to(ROOT)))))
(folder/'pins.json').write_text(json.dumps({'path':str(path.relative_to(ROOT)),
 'beforeSha256':hashlib.sha256(before.encode()).hexdigest(),'afterSha256':hashlib.sha256(after.encode()).hexdigest(),
 'sharedApply':'NOT AUTHORIZED; candidate only'},indent=2)+'\n')
print('Qualified Profile typed audit-union decoder candidate saved')
