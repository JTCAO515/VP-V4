import { FLAGS, defaultFlags, invalidFlags, invalidRegistry } from "../lib/flags/registry.ts";

const state = { ...defaultFlags };
const errors = [...invalidRegistry()];

for (const name of Object.keys(FLAGS)) {
  const value = process.env[name];
  if (value === undefined) continue;

  if (value !== "true" && value !== "false") {
    errors.push(`${name} must be true or false`);
    continue;
  }

  state[name] = value === "true";
}

errors.push(...invalidFlags(state));

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Feature flag registry passed (${Object.keys(FLAGS).length} R1 flags).`);
