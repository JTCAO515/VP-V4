import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../../..", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("V4-30 exposes no offline content until encrypted owner-isolated cache and expiry controls exist", async () => {
  const [page, view] = await Promise.all([
    source("app/visepanda/offline/page.tsx"),
    source("components/offline/OfflineWorkspace.tsx"),
  ]);

  assert.match(page, /OfflineWorkspace/);
  assert.match(view, /Offline pack is unavailable/);
  assert.match(view, /No encrypted owner-isolated cache, expiry record, logout cleanup, or deletion cleanup exists/);
  assert.match(view, /localeOptions/);
  assert.match(view, /document\.documentElement\.dir = attributes\.dir/);
  for (const label of ["VisePanda 首页", "Inicio de VisePanda", "Главная VisePanda", "الصفحة الرئيسية لـ VisePanda"]) {
    assert.match(view, new RegExp(label));
  }
  assert.doesNotMatch(view, /\bfetch\b|localStorage|sessionStorage|indexedDB|caches\.|serviceWorker|<button\b|method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
});
