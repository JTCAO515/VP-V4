/** Install fixed official AMap binaries locally; no credential handling, vendoring
 * or global Xcode changes. Download hashes pin the inspected 2026-09-22 archives. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const destination = resolve('ios/VisePanda/.local/amap');
mkdirSync(destination, { recursive: true });
const archives = [
  ['map-11.2.100.zip', 'https://a.amap.com/lbs/static/zip/AMap_iOS_3DMap_Lib_V11.2.100.zip', '76b5d1695d801c8308400eb066df2ef3616e2d569592147734244a4a09a78c15'],
  ['foundation-1.9.0.zip', 'https://a.amap.com/lbs/static/zip/AMap_iOS_Foundation_Lib_V1.9.0.zip', 'a2913ce2766af53e8bfffb01ee97c9165f71c9c7fd8c658d65ddc8ab4e1b1137'],
];
for (const [name, url, digest] of archives) {
  const archive = resolve(destination, name);
  const valid = () => existsSync(archive) && createHash('sha256').update(readFileSync(archive)).digest('hex') === digest;
  if (!valid()) execFileSync('curl', ['--fail', '--location', '--silent', '--show-error', '--max-time', '600', '--output', archive, url], { stdio: 'inherit' });
  if (!valid()) throw new Error(`Official SDK archive hash mismatch: ${name}; preserve it for inspection.`);
  execFileSync('unzip', ['-qo', archive, '-d', destination]);
}
console.log('Pinned AMap iOS SDK installed locally. API keys and runtime acceptance remain separate.');
