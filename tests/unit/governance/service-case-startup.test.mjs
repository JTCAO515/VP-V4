import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runOpsProcess, opsOutputClassifier } from '../../integration/service-cases/ops-process.mjs';

const secret = 'SYNTHETIC_SECRET_DO_NOT_LOG';
const payload = `Authorization: Bearer ${secret}\npostgres://user:${secret}@example.test/db\nhttps://example.test/?token=${secret}\nservice_role=${secret}\n`;
function invoke(script, phase = 'start') {
  const lines = [];
  return runOpsProcess(process.execPath, ['-e', script], { phase, report: line => lines.push(line) })
    .then(code => ({ code, lines }));
}
function diagnostic(lines) {
  assert.equal(lines.length, 1);
  assert.ok(lines[0].startsWith('VP_OPS_PROCESS_FAILURE '));
  assert.doesNotMatch(lines[0], /SYNTHETIC_SECRET|postgres:|https:|Bearer|service_role|example.test/);
  const result = JSON.parse(lines[0].slice('VP_OPS_PROCESS_FAILURE '.length));
  assert.deepEqual(Object.keys(result), ['schema', 'phase', 'exitCode', 'termination', 'launchError', 'hints']);
  return result;
}

test('successful CLI output is silent even when it contains secrets and failure-like phrases', async () => {
  const result = await invoke(`process.stdout.write(${JSON.stringify(payload+'unhealthy')});process.stderr.write(${JSON.stringify(payload)});`);
  assert.equal(result.code, 0); assert.deepEqual(result.lines, []);
});
test('failure preserves exit and only fixed hints; unknown output has no invented cause', async () => {
  for (const [text, expected] of [
    ['bind: address already in use', ['port_conflict']],
    ['Cannot connect to the Docker daemon', ['docker_unavailable']],
    ['toomanyrequests: Rate exceeded', ['image_rate_limit']],
    ['failed to pull image', ['image_pull']],
    ['no space left on device', ['resource_exhausted']],
    ['container is unhealthy', ['health_check']],
    ['failed to apply migration', ['migration']],
    [payload, []],
  ]) {
    const result = await invoke(`process.stdout.write(${JSON.stringify(payload)});process.stderr.write(${JSON.stringify(payload+text)});process.exitCode=37;`);
    assert.equal(result.code, 37);
    assert.deepEqual(diagnostic(result.lines), { schema: 'ops-process-failure/1', phase: 'start', exitCode: 37, termination: 'exit', launchError: 'none', hints: expected });
  }
});
test('stream boundaries, long output and control bytes never become diagnostic text', () => {
  const classifier = opsOutputClassifier();
  classifier.consume('stderr', Buffer.from(payload.repeat(10000)+'\x1b[31maddress already '));
  classifier.consume('stdout', Buffer.from('no space left on '));
  classifier.consume('stderr', Buffer.from('in use\x1b[0m'+payload));
  classifier.consume('stdout', Buffer.from('device'));
  assert.deepEqual(classifier.hints(), ['port_conflict', 'resource_exhausted']);
});
test('launch errors and signal termination are safe structured failures', async () => {
  const lines = [];
  assert.equal(await runOpsProcess('/missing/'+secret, [], { phase: 'start', report: x => lines.push(x) }), 1);
  assert.equal(diagnostic(lines).launchError, 'ENOENT');
  const signalled = await invoke("process.kill(process.pid,'SIGTERM')");
  assert.equal(signalled.code, 1); assert.equal(diagnostic(signalled.lines).termination, 'signal');
  await assert.rejects(async () => runOpsProcess('anything', [], { phase: secret }), /Invalid Ops process phase/);
});

test('real runner injected startup/cleanup failures do not run tests, retry or lose first exit', () => {
  const target = mkdtempSync(join(tmpdir(), 'vp-ops-startup-injection-'));
  const record = join(target, 'calls.jsonl');
  const fake = join(target, 'supabase');
  writeFileSync(fake, `#!${process.execPath}\n` + `
    const fs=require('node:fs');
    const args=process.argv.slice(2);
    if(args[0]==='--version')process.exit(0);
    const workdir=args[args.indexOf('--workdir')+1];
    const config=fs.readFileSync(workdir+'/supabase/config.toml','utf8');
    fs.appendFileSync(process.env.OPS_INJECTION_RECORD,JSON.stringify({phase:args[0],args,workdir,project:config.match(/^project_id = "([^"]+)"/m)[1]})+'\\n');
    process.stdout.write(${JSON.stringify(payload)});
    process.stderr.write(${JSON.stringify(payload+'address already in use')});
    process.exitCode=args[0]==='start'?37:Number(process.env.OPS_INJECTION_CLEANUP_EXIT);
  `, { mode: 0o700 });
  try {
    for (const cleanupExit of [0, 29]) {
      writeFileSync(record, '');
      const result = spawnSync(process.execPath, ['tests/integration/service-cases/run-local.mjs'], {
        encoding: 'utf8', timeout: 15000,
        env: { ...process.env, PATH: target+':'+process.env.PATH, VP_OPS_TEST_PORT_BASE: '63620', OPS_INJECTION_RECORD: record, OPS_INJECTION_CLEANUP_EXIT: String(cleanupExit) },
      });
      assert.equal(result.status, 37);
      assert.equal(result.stdout, '');
      assert.doesNotMatch(result.stderr, /SYNTHETIC_SECRET|postgres:|https:|Bearer|service_role|example.test|tests [0-9]/);
      const lines = result.stderr.trim().split('\n');
      assert.equal(lines.length, cleanupExit ? 2 : 1);
      assert.equal(diagnostic([lines[0]]).phase, 'start');
      if (cleanupExit) assert.equal(diagnostic([lines[1]]).exitCode, 29);
      const calls = readFileSync(record, 'utf8').trim().split('\n').map(JSON.parse);
      assert.deepEqual(calls.map(x => x.phase), ['start', 'stop']);
      assert.equal(calls[0].workdir, calls[1].workdir);
      assert.match(calls[0].project, /^vp-service-cases-[a-f0-9]{8}$/);
      assert.deepEqual(calls[1].args, ['stop', '--workdir', calls[0].workdir, '--no-backup']);
      assert.equal(existsSync(calls[0].workdir), Boolean(cleanupExit));
      // Failed cleanup leaves ownership data intact; this fixture created no Docker resources.
      if (cleanupExit) rmSync(calls[0].workdir, { recursive: true });
    }
  } finally { rmSync(target, { recursive: true }); }
});
