/** Runs one Native actual-HTTP proof on the paired owned stack. No new stack/device/provider. */
import { openSync, fstatSync, readFileSync, closeSync, mkdirSync, writeFileSync, constants } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
const path = process.env.VP_NATIVE_PDF_FIXTURE_FILE;
const simulator = process.env.VP_NATIVE_PDF_SIMULATOR_ID;
if (!path || !isAbsolute(path) || !simulator || !/^[0-9A-Fa-f-]{36}$/.test(simulator)) throw Error('An explicit owned fixture and leased simulator are required');
const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
let fixture;
try {
  const info = fstatSync(descriptor);
  if (!info.isFile() || info.size > 8192 || (info.mode & 0o777) !== 0o600 || info.uid !== process.getuid()) throw Error('Protected owned synthetic fixture required');
  fixture = JSON.parse(readFileSync(descriptor, 'utf8'));
} finally { closeSync(descriptor); }
if (Object.keys(fixture).sort().join(',') !== 'apiOrigin,email,password,tripId'
  || !Object.values(fixture).every(value => typeof value === 'string' && value.length > 0 && value.length <= 512)
  || !/^[0-9a-f-]{36}$/.test(fixture.tripId)) throw Error('Invalid closed synthetic fixture');
const api = new URL(fixture.apiOrigin);
if (api.protocol !== 'http:' || api.hostname !== '127.0.0.1' || api.username || api.password || api.pathname !== '/' || api.search || api.hash) throw Error('Only the paired loopback API is allowed');
const root = process.cwd(), output = join(root, 'artifacts/VPJ-55/native-pdf-20261005');
mkdirSync(output, { recursive: true });
const result = join(tmpdir(), 'vpj55-native-http-' + randomUUID() + '.xcresult');
const derived = process.env.VP_NATIVE_PDF_DERIVED_DATA || join(tmpdir(), 'vpj55-native-pdf-dd');
const args = ['test', '-project', 'ios/VisePanda/VisePanda.xcodeproj', '-scheme', 'VisePanda', '-destination', 'platform=iOS Simulator,id=' + simulator,
  '-derivedDataPath', derived, '-resultBundlePath', result,
  '-only-testing:VisePandaTests/NativePDFIntegrationTests/testPDFKitCorrectPreviewOriginalConfirmReloadAndReceipt', 'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-'];
const nativeEnv = Object.fromEntries(['HOME', 'PATH', 'TMPDIR', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'DEVELOPER_DIR'].flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]]]));
const child = spawn('xcodebuild', args, { cwd: root, env: { ...nativeEnv, SIMCTL_CHILD_VP_NATIVE_PDF_TEST: '1',
  SIMCTL_CHILD_VP_NATIVE_PDF_API_ORIGIN: fixture.apiOrigin, SIMCTL_CHILD_VP_NATIVE_PDF_EMAIL: fixture.email,
  SIMCTL_CHILD_VP_NATIVE_PDF_PASSWORD: fixture.password, SIMCTL_CHILD_VP_NATIVE_PDF_TRIP_ID: fixture.tripId }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { log += bytes.toString(); });
const code = await new Promise((resolve, reject) => { child.once('error', () => reject(Error('Native proof launch failed'))); child.once('exit', value => resolve(value ?? 1)); });
// Build scripts may echo their environment. Never retain or forward fixture credentials.
log = log.split('\n').filter(line => !/VP_NATIVE_PDF_(PASSWORD|EMAIL)/.test(line)).join('\n');
for (const secret of [fixture.password, fixture.email]) log = log.split(secret).join('[synthetic-redacted]');
writeFileSync(join(output, 'native-http-sanitized.log'), log, { mode: 0o600 });
const summaries = log.split('\n').filter(line => line.includes('Test Case ') || line.includes('Executed ') || line.includes('error:') || line.includes('** TEST '));
console.log(summaries.join('\n'));
if (code !== 0 || !log.includes('Executed 1 test, with 0 failures') || /with [1-9]\d* test[s]? skipped|skipped \(/.test(log)) {
  console.error('VPJ55_NATIVE_PDF_ACTUAL FAIL; full sanitized log retained'); process.exitCode = 1;
} else { console.log('VPJ55_NATIVE_PDF_ACTUAL PASS 1/0fail/0skip; Files picker/device/target acceptance UNRUN'); }
