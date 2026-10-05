/** Explicit finite notification host. No startup, deployment or permission activation. */
import { runHostedNotifications } from '../notifications/hosted.ts';
const controller = new AbortController(), stop = () => controller.abort();
const values = {}, allowed = new Set(['--profile', '--ticks', '--max-ms', '--interval-ms']);
let valid = process.argv.slice(2).length % 2 === 0;
for (let i = 2; valid && i < process.argv.length; i += 2) {
 const key = process.argv[i], value = process.argv[i + 1];
 if (!allowed.has(key) || Object.hasOwn(values, key) || typeof value !== 'string') valid = false;
 else values[key] = value;
}
for (const key of ['--ticks', '--max-ms', '--interval-ms']) if (values[key] !== undefined && !/^(0|[1-9][0-9]{0,5})$/.test(values[key])) valid = false;
if (!valid) {
 process.stdout.write(JSON.stringify({schemaVersion:'notification-host/1',reason:'unavailable'})+'\n');process.exitCode=2;
} else {
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try {
  const result=await runHostedNotifications({profile:values['--profile']??'disabled',ticks:values['--ticks']===undefined?1:Number(values['--ticks']),maxMs:values['--max-ms']===undefined?25000:Number(values['--max-ms']),intervalMs:values['--interval-ms']===undefined?0:Number(values['--interval-ms'])},controller.signal);
  process.stdout.write(JSON.stringify(result)+'\n');
  if(result.reason==='unavailable')process.exitCode=1;
 } catch { process.stdout.write(JSON.stringify({schemaVersion:'notification-host/1',reason:'unavailable'})+'\n');process.exitCode=1; }
 finally { process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop); }
}
