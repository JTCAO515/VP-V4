import { appendFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const [command, ...args] = process.argv.slice(2);

if (!command) throw new Error("Usage: node scripts/record-command.mjs <command> [args...]");

const startedAt = new Date().toISOString();
const result = spawnSync(command, args, { stdio: "inherit" });
const finishedAt = new Date().toISOString();
const exitCode = result.status ?? 1;

await mkdir("artifacts/AI-07a", { recursive: true });
await appendFile(
  "artifacts/AI-07a/commands.jsonl",
  `${JSON.stringify({ command: [command, ...args].join(" "), exitCode, startedAt, finishedAt, env: "local scaffold" })}\n`,
);

if (result.error) throw result.error;
process.exit(exitCode);
