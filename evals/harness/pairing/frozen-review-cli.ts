import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { freezeReview, evaluateFrozenReview, renderFrozenReview, type FreezeInput, type FrozenReview } from "./frozen-review.ts";
import { ReviewInputError, type ReviewState } from "../response-quality/index.ts";

function read(path: string): unknown {
  if (statSync(path).size > 2_000_000) throw new ReviewInputError("FILE_LIMIT");
  return JSON.parse(readFileSync(path, "utf8"));
}
try {
  const [command, first, second, third, extra] = process.argv.slice(2);
  if (command === "freeze" && first && second && !third) {
    const frozen = freezeReview(read(first) as FreezeInput);
    writeFileSync(second, JSON.stringify(frozen, null, 2) + "\n", { flag: "wx" });
  } else if (command === "report" && first && second && third && !extra) {
    const report = evaluateFrozenReview(read(first) as FrozenReview, read(second) as ReviewState);
    // A fresh directory prevents replacing an earlier freeze/report or human feedback.
    mkdirSync(third);
    writeFileSync(join(third, "results.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    writeFileSync(join(third, "summary.md"), renderFrozenReview(report), { flag: "wx" });
  } else throw new ReviewInputError("USAGE: freeze plan.json frozen.json | report frozen.json state.json new-output-dir");
  process.stdout.write("Offline freeze/report written; real pairing and human calibration remain UNRUN.\n");
} catch (error) {
  process.stderr.write(`${error instanceof ReviewInputError ? error.message : "INVALID_LOCAL_INPUT_OR_EXISTING_OUTPUT"}\n`);
  process.exitCode = 1;
}
