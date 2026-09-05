import { appendFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const [command, ...args] = process.argv.slice(2);
const artifactIssue = process.env.VP_ARTIFACT_ISSUE ?? "AI-07a";

if (!command) throw new Error("Usage: node scripts/record-command.mjs <command> [args...]");
if (!/^(?:AI-\d{2}[a-z]?|V4-\d{2}|WEB-\d{2}|LAUNCH-\d{2}|VPJ-\d{2}|GOV-[A-Z0-9]+(?:-[A-Z0-9]+)*)$/.test(artifactIssue)) {
  throw new Error("VP_ARTIFACT_ISSUE must use an AI, V4, WEB, LAUNCH, VPJ, or GOV issue identifier.");
}

const startedAt = new Date().toISOString();
const isWindowsBatchCommand = process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
const result = isWindowsBatchCommand
  ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", [command, ...args.map(quoteForCmd)].join(" ")], { stdio: "inherit" })
  : spawnSync(command, args, { stdio: "inherit" });
const finishedAt = new Date().toISOString();
const exitCode = result.status ?? 1;
const displayCommand = command.toLowerCase() === "pnpm.cmd" ? "pnpm" : command;

const artifactDirectory = `artifacts/${artifactIssue}`;
await mkdir(artifactDirectory, { recursive: true });
await appendFile(
  `${artifactDirectory}/commands.jsonl`,
  `${JSON.stringify({ command: [displayCommand, ...args].join(" "), exitCode, startedAt, finishedAt, env: "local" })}\n`,
);

if (result.error) throw result.error;
process.exit(exitCode);

function quoteForCmd(value) {
  const stringValue = String(value);
  if (/^[A-Za-z0-9_@%:./=+-]+$/.test(stringValue)) return stringValue.replaceAll("%", "%%");
  return `"${stringValue.replaceAll("%", "%%").replaceAll('"', '""')}"`;
}
