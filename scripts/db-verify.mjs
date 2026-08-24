import { existsSync } from "node:fs";

const initialized = existsSync("supabase");

console.log(JSON.stringify({
  command: "db:verify",
  status: initialized ? "database-baseline-present" : "scaffold-not-configured",
  message: initialized
    ? "AI-08 owns the actual Supabase connection and migration verification."
    : "No Supabase baseline exists yet; no database connection was attempted.",
}));
