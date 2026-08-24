import { appendFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const [command, ...args] = process.argv.slice(2);
const artifactIssue = process.env.VP_ARTIFACT_ISSUE ?? "AI-07a";

if (!command) throw new Error("Usage: node scripts/record-command.mjs <command> [args...]");
if (!/^AI-\d{2}[a-z]?$/.test(artifactIssue)) throw new Error("VP_ARTIFACT_ISSUE must use an AI issue identifier.");

const startedAt = new Date().toISOString();
const result = spawnSync(command, args, { stdio: "inherit" });
const finishedAt = new Date().toISOString();
const exitCode = result.status ?? 1;

const artifactDirectory = `artifacts/${artifactIssue}`;
await mkdir(artifactDirectory, { recursive: true });
await appendFile(
  `${artifactDirectory}/commands.jsonl`,
  `${JSON.stringify({ command: [command, ...args].join(" "), exitCode, startedAt, finishedAt, env: "local" })}\n`,
);

if (result.error) throw result.error;
process.exit(exitCode);
