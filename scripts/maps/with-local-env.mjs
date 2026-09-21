// Explicit local opt-in; never print credentials or inject them into command text.
import { loadEnvFile } from 'node:process';
import { spawn } from 'node:child_process';
const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error('Usage: node scripts/maps/with-local-env.mjs <command> [args...]');
loadEnvFile('.env.maps.local');
const child = spawn(command, args, { stdio: 'inherit', env: process.env, shell: false });
child.on('error', () => { console.error('Could not start the local command.'); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
