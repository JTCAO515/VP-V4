import { readFileSync, statSync, mkdirSync, writeFileSync, existsSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { randomBytes } from "node:crypto";
import { prepareReview, blindPackage, feedbackTemplate, importFeedback, qualityReport, renderReviewMarkdown, renderQualityMarkdown, ReviewInputError, type ReviewState } from "./index.ts";

const JSON_FILE_BYTES = 2_000_000;
const read = (path: string): unknown => { if (statSync(path).size > JSON_FILE_BYTES) throw new ReviewInputError("FILE_LIMIT"); return JSON.parse(readFileSync(path, "utf8")); };
function save(state: ReviewState, directory: string, prepare: boolean) {
  const encodedState = JSON.stringify(state, null, 2) + "\n";
  // A successful write must remain readable by this CLI, even across many valid batches.
  if (Buffer.byteLength(encodedState, "utf8") > JSON_FILE_BYTES) throw new ReviewInputError("STATE_FILE_LIMIT");
  const report = qualityReport(state);
  const statePath = join(directory, "state.json");
  if (existsSync(statePath)) {
    if (prepare) throw new ReviewInputError("OUTPUT_ALREADY_EXISTS");
    const previous = read(statePath) as ReviewState;
    qualityReport(previous);
    if (previous.bundle.hash !== state.bundle.hash || !previous.feedback.every((old) => state.feedback.some((current) => isDeepStrictEqual(old, current)))) throw new ReviewInputError("EXISTING_FEEDBACK_WOULD_BE_LOST");
  }
  mkdirSync(directory, { recursive: true });
  const write = (name: string, content: string) => {
    const temporary = join(directory, `.${name}.${randomBytes(8).toString("hex")}.tmp`);
    try { writeFileSync(temporary, content); renameSync(temporary, join(directory, name)); }
    finally { if (existsSync(temporary)) unlinkSync(temporary); }
  };
  const json = (name: string, value: unknown) => write(name, JSON.stringify(value, null, 2) + "\n");
  write("state.json", encodedState); json("results.json", report);
  write("summary.md", renderQualityMarkdown(report));
  if (prepare) {
    json("review.json", blindPackage(state.bundle)); json("feedback-template.json", feedbackTemplate(state.bundle));
    write("review.md", renderReviewMarkdown(state.bundle));
  }
}
try {
  const [command, first, second, directory, option] = process.argv.slice(2);
  if (!first || !second || !directory) throw new ReviewInputError("USAGE: prepare pairing.json samples.json output-dir [report-name] | import state.json feedback.json output-dir fixture-or-human");
  if (command === "prepare") {
    const loaded = read(first);
    const selector = option ?? "unchanged";
    const source = loaded && typeof loaded === "object" && "reports" in loaded && loaded.reports && typeof loaded.reports === "object" && Object.hasOwn(loaded.reports, selector) ? Reflect.get(loaded.reports, selector) : loaded;
    save(prepareReview(source, read(second), randomBytes(24).toString("hex")), directory, true);
  } else if (command === "import" && (option === "fixture" || option === "human")) {
    save(importFeedback(read(first) as ReviewState, read(second), option), directory, false);
  } else throw new ReviewInputError("INVALID_COMMAND_OR_SOURCE");
  process.stdout.write("VPJ-72 offline report written; runtime acceptance remains UNRUN.\n");
} catch (error) {
  process.stderr.write(`${error instanceof ReviewInputError ? error.message : "INVALID_LOCAL_INPUT"}\n`);
  process.exitCode = 1;
}
