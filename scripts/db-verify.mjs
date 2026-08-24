import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const initialized = existsSync("supabase/config.toml");
const probe = initialized ? spawnSync(process.execPath, ["scripts/db/connection-probes.mjs"], { encoding: "utf8" }) : null;

console.log(JSON.stringify({
  command: "db:verify",
  status: initialized ? "database-baseline-present" : "scaffold-not-configured",
  message: initialized
    ? "AI-08 local baseline exists; connection probes disclose configured versus unconfigured state."
    : "No Supabase baseline exists yet; no database connection was attempted.",
  probes: probe?.stdout.trim() ? JSON.parse(probe.stdout) : null,
}));
