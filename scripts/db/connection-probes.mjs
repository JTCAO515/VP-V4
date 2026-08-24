import { spawnSync } from "node:child_process";

const paths = ["user-jwt-rpc", "ops-jwt-rpc", "system-worker-pooler"];
const localStatus = spawnSync("supabase", ["status", "--workdir", ".", "-o", "env"], { encoding: "utf8" });
const discoveredLocal = localStatus.status === 0 && /DB_URL=.*(?:127\.0\.0\.1|localhost)/.test(localStatus.stdout);
const status = process.env.SUPABASE_DB_URL ? "configured-by-environment" : discoveredLocal ? "local-service-running" : "not-configured";

console.log(JSON.stringify({
  status,
  paths: paths.map((path) => ({ path, status: status === "not-configured" ? "not-configured" : "available-for-explicit-probe" })),
  productionConnectionAttempted: false,
}));
