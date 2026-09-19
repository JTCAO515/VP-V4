import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import path from "node:path";

// artifacts/ is committed evidence (verification.md, screenshots, logs), not build
// output; nothing here is ever deleted by tooling. As of 2026-09-18 it is already
// ~158MB, 81% of which (~128MB) is PNG screenshots. This guard does not touch any
// existing file — it only stops a single PR from adding more full-resolution,
// unthumbnailed evidence than a real verification round needs, so the directory
// does not keep growing unbounded. Raise MAX_ADDED_BYTES deliberately, in the same
// PR that needs more room, if a legitimate round needs it.
const MAX_ADDED_BYTES = 5 * 1024 * 1024;

const blobSize = (ref, file) => {
  try {
    return Number(execFileSync("git", ["cat-file", "-s", `${ref}:${file}`], { encoding: "utf8" }).trim());
  } catch {
    return 0;
  }
};

const resolveBaseHead = (env) => {
  if (/^[a-f0-9]{40}$/.test(env.VP_CI_BASE ?? "") && /^[a-f0-9]{40}$/.test(env.VP_CI_HEAD ?? "")) {
    return { base: env.VP_CI_BASE, head: env.VP_CI_HEAD };
  }
  try {
    const base = execFileSync("git", ["merge-base", "HEAD", "origin/main"], { encoding: "utf8" }).trim();
    return { base, head: "HEAD" };
  } catch {
    return null;
  }
};

export function computeAddedBytes(base, head) {
  const changed = execFileSync("git", ["diff", "--name-status", "--no-renames", "-z", base, head, "--", "artifacts/"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).split("\0").filter(Boolean);
  let addedBytes = 0;
  const grown = [];
  for (let i = 0; i < changed.length; i += 2) {
    const status = changed[i];
    const file = changed[i + 1];
    if (status !== "A" && status !== "M") continue;
    const headSize = blobSize(head, file);
    const baseSize = status === "A" ? 0 : blobSize(base, file);
    const delta = headSize - baseSize;
    if (delta > 0) {
      addedBytes += delta;
      grown.push({ file, delta });
    }
  }
  return { addedBytes, grown: grown.sort((a, b) => b.delta - a.delta) };
}

function main() {
  const resolved = resolveBaseHead(process.env);
  if (!resolved) {
    console.log("check:artifacts: no base ref available (not a PR, no origin/main); skipping.");
    return;
  }
  const { addedBytes, grown } = computeAddedBytes(resolved.base, resolved.head);
  const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(2);
  if (addedBytes > MAX_ADDED_BYTES) {
    const top = grown.slice(0, 10).map((entry) => `  +${mb(entry.delta)}MB  ${entry.file}`).join("\n");
    const message = `check:artifacts: this diff adds ${mb(addedBytes)}MB of new/grown files under artifacts/ ` +
      `(limit ${mb(MAX_ADDED_BYTES)}MB). Largest additions:\n${top}\n\n` +
      "artifacts/ is committed evidence, not disposable build output, so it never shrinks on its own. " +
      "Prefer a smaller number of representative screenshots (resized/cropped to the relevant region) " +
      "over a full raw set, and prefer linking to CI's own artifact storage for large logs instead of " +
      "committing them. If this round genuinely needs the room, raise MAX_ADDED_BYTES in " +
      "scripts/check-artifact-growth.mjs in the same PR and say why.";
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${message}\n`);
    throw new Error(message);
  }
  console.log(`check:artifacts: +${mb(addedBytes)}MB under artifacts/ (limit ${mb(MAX_ADDED_BYTES)}MB) — OK`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("scripts/check-artifact-growth.mjs")) {
  main();
}
