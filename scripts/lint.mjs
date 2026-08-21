import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const scannedRoots = ["app", "components", "lib"];
const forbiddenRuntimeClaims = [
  "Layla",
  "莱拉",
  "Bellboy",
  "Roam Around",
  "实时价格",
  "2,090,000",
  "我的投资者",
  "在全球顶尖媒体上亮相",
];
const violations = [];

function collectFiles(directory) {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((entry) => {
    const child = join(absolute, entry);
    if (statSync(child).isDirectory()) return collectFiles(relative(root, child));
    return /\.(ts|tsx|css)$/.test(entry) ? [child] : [];
  });
}

const files = scannedRoots.flatMap(collectFiles);

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const name = relative(root, file);

  for (const claim of forbiddenRuntimeClaims) {
    if (source.includes(claim)) violations.push(`${name}: forbidden runtime copy: ${claim}`);
  }
  if (/<img\b/i.test(source)) violations.push(`${name}: use next/image instead of <img>`);
  if (/:\s*any\b|\bas\s+any\b|<any>/.test(source)) {
    violations.push(`${name}: explicit any is not allowed`);
  }
  if (
    source.includes('"use client"') &&
    /(?:export\s+default\s+)?async\s+function\s+[A-Z]/.test(source)
  ) {
    violations.push(`${name}: async Client Components are invalid`);
  }
}

const requiredFiles = [
  "app/layout.tsx",
  "app/page.tsx",
  "app/globals.css",
  "components/VisePandaLanding.tsx",
  "postcss.config.mjs",
  "tsconfig.json",
];
for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) violations.push(`missing required file: ${file}`);
}

const removedRuntimeFiles = [
  "index.html",
  "vite.config.mjs",
  "src/App.jsx",
  "src/main.jsx",
  "worker/index.js",
  ".openai/hosting.json",
];
for (const file of removedRuntimeFiles) {
  if (existsSync(join(root, file))) violations.push(`legacy runtime file remains: ${file}`);
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log(`Source policy lint passed (${files.length} files checked).`);
