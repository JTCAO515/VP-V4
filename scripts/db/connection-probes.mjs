import { identityLocalEnv } from "./explicit-local-target.mjs";

const paths = ["user-jwt-rpc", "ops-jwt-rpc", "system-worker-pooler"];
const local = identityLocalEnv();
const status = local ? "explicit-local-service-running" : "not-configured";
console.log(JSON.stringify({
  status,
  paths: paths.map((path) => ({ path, status: local ? "available-for-explicit-probe" : "not-configured" })),
  productionConnectionAttempted: false,
}));
