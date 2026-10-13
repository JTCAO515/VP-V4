from pathlib import Path
import hashlib, difflib, json
root=Path(__file__).resolve().parents[3]
out=Path(__file__).parent
path=Path('lib/server/jobs/hosted-text-worker.ts')
before=(root/path).read_text()
after=before
imports='''import { createQaWorker, type QaWorkerConfiguration } from "../qa-agent/worker.ts";
import { parseQaHostedProfile, planQaGroup, type QaHostedProfile } from "../qa-agent/hosted-profile.ts";
import { createQaContextInvoker } from "../qa-agent-context/executor-adapter.ts";
'''
after=imports+after
after=after.replace('export type HostedWorkerProfile = Readonly<{','export type LegacyHostedWorkerProfile = Readonly<{',1)
needle='export type ReadyGroup = Readonly<{'
after=after.replace(needle,'export type HostedWorkerProfile = LegacyHostedWorkerProfile | QaHostedProfile;\n'+needle,1)
after=after.replace('export function parseHostedWorkerProfile(raw: unknown): HostedWorkerProfile {','export function parseHostedWorkerProfile(raw: unknown): HostedWorkerProfile {\n  if (record(raw) && raw.schemaVersion === "vpj07-hosted-text-worker/3") return parseQaHostedProfile(raw);',1)
after=after.replace('const profile = raw as unknown as HostedWorkerProfile;','const profile = raw as unknown as LegacyHostedWorkerProfile;',1)
after=after.replace('export function jobConfig(profile: HostedWorkerProfile,','export function jobConfig(profile: LegacyHostedWorkerProfile,',1)
after=after.replace('export function planGroup(profile: HostedWorkerProfile, raw: unknown, qwenEndpoint: string): StagingTextJobConfig | null {','export function planGroup(profile: HostedWorkerProfile, raw: unknown, qwenEndpoint: string): StagingTextJobConfig | null {\n  if (profile.schemaVersion === "vpj07-hosted-text-worker/3") return null;',1)
after=after.replace('job: (digest: string, job: StagingTextJobConfig)', 'job: (digest: string, job: StagingTextJobConfig | QaWorkerConfiguration)',1)
needle='      const job = planGroup(profile, group, dependencies.qwenEndpoint);'
qa='''      if (profile.schemaVersion === "vpj07-hosted-text-worker/3") {
        const job = planQaGroup(profile, group, dependencies.qwenEndpoint);
        if (!job) return null;
        const digest = createHash("sha256").update(JSON.stringify(job)).digest("hex");
        const poll = createQaWorker(job, {
          workerCredential: dependencies.workerCredential, providerCredential: dependencies.providerCredential,
          qwenEndpoint: dependencies.qwenEndpoint, recordDestination: dependencies.journal.destination,
          recordUsage: (receipt, stop) => dependencies.journal.usage(digest, receipt, stop),
          invokeContext: createQaContextInvoker(),
          ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
        });
        return { ownerId: job.ownerId, poll: async stop => {
          if (!journaled.has(digest)) { await dependencies.journal.job(digest, job); journaled.add(digest); }
          const result = await poll(stop);
          // Existing heartbeat vocabulary remains unchanged. SQL retains the
          // dispatched attempt for explicit reconciliation, never a second send.
          return result === "reconciliation_required" ? "unavailable" : result;
        } };
      }
'''
assert needle in after
after=after.replace(needle,qa+needle,1)
(out/'before.ts.txt').write_text(before)
(out/'after.ts.txt').write_text(after)
(out/'hosted-text-worker.patch').write_text(''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+str(path),tofile='b/'+str(path))))
(out/'pins.json').write_text(json.dumps({'status':'NOT_APPLIED','path':str(path),'beforeSha256':hashlib.sha256(before.encode()).hexdigest(),'afterSha256':hashlib.sha256(after.encode()).hexdigest()},indent=2)+'\n')
# The profile union also reaches the existing read-only journal auditor. This
# companion is a candidate, not an edit to that shared source or a settlement.
path=Path('lib/server/jobs/hosted-usage-audit.ts')
before=(root/path).read_text()
after='import { qaJobConfig } from "../qa-agent/hosted-profile.ts";\nimport { auditQaUsage } from "../qa-agent/usage-audit.ts";\nimport type { QaWorkerConfiguration } from "../qa-agent/worker.ts";\n'+before
after=after.replace('job: ReturnType<typeof jobConfig>;','job: ReturnType<typeof jobConfig> | QaWorkerConfiguration;')
old='''      if (!profile.modes.includes(mode) || typeof job.ownerId !== "string" || !UUID.test(job.ownerId)'''
new='''      if ((profile.schemaVersion === "vpj07-hosted-text-worker/3" ? job.schemaVersion !== "qa-agent-worker/1" : !profile.modes.includes(mode)) || typeof job.ownerId !== "string" || !UUID.test(job.ownerId)'''
assert old in after;after=after.replace(old,new)
after=after.replace('const expected = jobConfig(profile, mode, job.ownerId, job.policyId, job.budget.scopeId, first.qwenEndpoint);','const expected = profile.schemaVersion === "vpj07-hosted-text-worker/3"\n        ? qaJobConfig(profile, job.ownerId, job.policyId, job.budget.scopeId, first.qwenEndpoint)\n        : jobConfig(profile, mode, job.ownerId, job.policyId, job.budget.scopeId, first.qwenEndpoint);')
after=after.replace('    stagingUsageReconciliation(group.job, []);','    const validate = (rows: readonly unknown[]) => group.job.schemaVersion === "qa-agent-worker/1" ? auditQaUsage(group.job, rows) : stagingUsageReconciliation(group.job, rows);\n    validate([]);')
after=after.replace('stagingUsageReconciliation(group.job, group.receipts.slice(i, i + 100))','validate(group.receipts.slice(i, i + 100))')
(out/'usage-audit.before.ts.txt').write_text(before)
(out/'usage-audit.after.ts.txt').write_text(after)
(out/'hosted-usage-audit.patch').write_text(''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+str(path),tofile='b/'+str(path))))
(out/'usage-audit-pins.json').write_text(json.dumps({'status':'NOT_APPLIED','path':str(path),'beforeSha256':hashlib.sha256(before.encode()).hexdigest(),'afterSha256':hashlib.sha256(after.encode()).hexdigest()},indent=2)+'\n')
