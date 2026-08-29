import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const fail = (message) => {
  throw new Error(`Asset policy failed: ${message}`);
};

const ledger = readJson("docs/licenses/asset-rights-ledger.json");
const canonicalTextAssetPaths = new Set(ledger.records
  .filter((record) => record.policy === "internal-brand" && [".html", ".json", ".svg"].includes(path.extname(record.path)))
  .map((record) => record.path));
const sha256 = (file) => {
  const contents = readFileSync(file);
  const canonicalContents = canonicalTextAssetPaths.has(file.replaceAll("\\", "/"))
    ? Buffer.from(contents.toString("utf8").replace(/\r\n/g, "\n"), "utf8")
    : contents;
  return createHash("sha256").update(canonicalContents).digest("hex");
};
const quarantine = readJson("docs/licenses/WEB-04-quarantine.json");
const sbom = readJson("docs/licenses/sbom.json");
const packageJson = readJson("package.json");
const manifest = readJson("brand/qa/asset-manifest.json");
const notice = readFileSync("docs/licenses/NOTICE.md", "utf8");
const declaredPaths = new Set([...manifest.sourceAssets, ...manifest.assets.map((asset) => asset.path)]);
const releaseMode = process.argv.includes("--release");
const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const entryPath = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(entryPath) : [entryPath.replaceAll("\\", "/")];
});

if (ledger.policy !== "deny-by-default") fail("ledger is not deny-by-default");
if (ledger.records.length !== declaredPaths.size) fail("ledger record count differs from brand manifest");
for (const record of ledger.records) {
  const policy = ledger.policies[record.policy];
  if (!declaredPaths.delete(record.path)) fail(`unexpected or duplicate record ${record.id}`);
  if (!policy || !record.id || !/^[a-f0-9]{64}$/.test(record.sha256)) fail(`invalid record ${record.id}`);
  for (const field of ["owner", "sourceType", "license", "derivativeProvenance", "permittedSurfaces", "reviewStatus", "approver"]) {
    if (!policy[field] || (Array.isArray(policy[field]) && policy[field].length === 0)) fail(`${record.id} missing ${field}`);
  }
  if (!existsSync(record.path) || sha256(record.path) !== record.sha256) fail(`hash mismatch for ${record.id}`);
}
if (declaredPaths.size !== 0) fail("brand manifest has an unledgered asset");

for (const retired of quarantine.retiredFiles) {
  if (existsSync(retired.path)) fail(`retired file remains: ${retired.path}`);
}
if (existsSync("public/assets/source") && readdirSync("public/assets/source").length !== 0) fail("legacy public source tree remains");

const retiredTree = quarantine.retiredTrees[0];
const retiredPaths = execFileSync("git", ["ls-tree", "-r", "--name-only", quarantine.sourceCommit, retiredTree.path], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);
if (retiredPaths.length !== retiredTree.fileCount) fail("retired source file count differs from quarantine record");
const retiredHashes = new Set(retiredPaths.map((retiredPath) => createHash("sha256")
  .update(execFileSync("git", ["show", `${quarantine.sourceCommit}:${retiredPath}`], { maxBuffer: 16 * 1024 * 1024 }))
  .digest("hex")));
const publicFiles = existsSync("public") ? walk("public") : [];
const blockedByPath = new Map(quarantine.blockedReleaseFiles.map((asset) => [asset.path, asset.sha256]));
for (const publicFile of publicFiles) {
  const publicHash = sha256(publicFile);
  if (retiredHashes.has(publicHash)) fail(`retired source hash remains public: ${publicFile}`);
  if (!blockedByPath.has(publicFile)) fail(`unregistered public asset: ${publicFile}`);
  if (blockedByPath.get(publicFile) !== publicHash) fail(`blocked preview drift: ${publicFile}`);
}

for (const blocked of quarantine.blockedReleaseFiles) {
  if (!existsSync(blocked.path) || sha256(blocked.path) !== blocked.sha256) fail(`blocked preview drift: ${blocked.path}`);
}
if (releaseMode && quarantine.blockedReleaseFiles.length > 0) fail("blocked-release assets remain in public output");

const expectedDependencies = Object.entries(packageJson.dependencies).sort(([left], [right]) => left.localeCompare(right));
const sbomDependencies = sbom.components.map((component) => [component.name, component.version]).sort(([left], [right]) => left.localeCompare(right));
if (JSON.stringify(expectedDependencies) !== JSON.stringify(sbomDependencies)) fail("SBOM does not match direct runtime dependencies");
for (const component of sbom.components) {
  const installedLicense = readJson(path.join("node_modules", component.name, "package.json")).license;
  if (component.licenses?.[0]?.license?.id !== installedLicense) fail(`SBOM license differs from installed package for ${component.name}`);
}
for (const requiredNotice of ["asset-rights-ledger.json", "sbom.json", "WEB-04-quarantine.json"]) {
  if (!notice.includes(requiredNotice)) fail(`NOTICE omits ${requiredNotice}`);
}

for (const file of ["app/layout.tsx", "app/globals.css", "components/VisePandaLanding.tsx"]) {
  const source = readFileSync(file, "utf8");
  if (/fig|assets\/source|vp-clover|BrandClip/i.test(source)) fail(`denylisted runtime reference in ${path.basename(file)}`);
}

console.log(`Asset policy passed (${ledger.records.length} ledger records; ${quarantine.blockedReleaseFiles.length} blocked preview files; mode=${releaseMode ? "release" : "preview"}).`);
