import { constants } from "node:fs";
import { open, lstat, realpath, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { basename, dirname, isAbsolute } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { exact, record, uuid } from "./service.ts";

/** A run-control record in the original private hosted journal, NOT a money
 * ledger or a permission to activate. The trusted root supplies the reviewed
 * grant and the same journal path on every restart. No HTTP/env/default lookup. */
export type QaAcceptanceBinding = Readonly<{
  projectRef: string; ownerId: string; policyId: string; scopeId: string;
  noticeHash: string; configurationId: string; configurationVersion: number;
  sourceCommit: string; jobDigest: string;
}>;
export type QaAcceptanceGrant = Readonly<{
  schemaVersion: "qa-acceptance-grant/1"; runId: string;
  binding: QaAcceptanceBinding; activatedAt: number; expiresAt: number;
  maxPhysicalAttempts: 2; concurrency: 1; retries: 0;
}>;
export type QaAcceptancePermit = Readonly<{
  beforeDispatch(input: Readonly<{ turnId: string; attemptId: string; requestDigest: string }>): Promise<void>;
  finish(outcome: "success" | "empty" | "stopped"): Promise<void>;
}>;
export type QaAcceptanceControl = Readonly<{
  binding: QaAcceptanceBinding;
  enter(signal: AbortSignal): Promise<QaAcceptancePermit>;
  /** Sticky veto independent of the active attempt's mutex. Never a fee receipt. */
  requestStop(): Promise<void>;
}>;

type Entry = { sequence: number; at: number; kind: string; operationId?: string;
  turnId?: string; attemptId?: string; requestDigest?: string; grant?: QaAcceptanceGrant };
const MAX_JOURNAL_BYTES = 262144;
export const acceptanceDigest = (value: unknown) => createHash("sha256").update(JSON.stringify(value,
  (_key, item) => record(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)).digest("hex");
const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const failure = () => new Error("QA acceptance run stopped or unavailable");

function validateGrant(value: QaAcceptanceGrant) {
  if (!record(value) || !exact(value, ["schemaVersion", "runId", "binding", "activatedAt", "expiresAt", "maxPhysicalAttempts", "concurrency", "retries"])
    || value.schemaVersion !== "qa-acceptance-grant/1" || !uuid(value.runId)
    || value.maxPhysicalAttempts !== 2 || value.concurrency !== 1 || value.retries !== 0
    || !Number.isSafeInteger(value.activatedAt) || !Number.isSafeInteger(value.expiresAt)
    || value.activatedAt < 1 || value.expiresAt <= value.activatedAt || value.expiresAt - value.activatedAt > 1800000) throw failure();
  const b = value.binding;
  if (!record(b) || !exact(b, ["projectRef", "ownerId", "policyId", "scopeId", "noticeHash", "configurationId", "configurationVersion", "sourceCommit", "jobDigest"])
    || b.projectRef !== "dzqdzetcctkhbrhlxxgn" || ![b.ownerId, b.policyId, b.scopeId, b.configurationId].every(uuid)
    || !hash(b.noticeHash) || !hash(b.jobDigest) || typeof b.sourceCommit !== "string" || !/^[a-f0-9]{40}$/.test(b.sourceCommit)
    || !Number.isSafeInteger(b.configurationVersion) || b.configurationVersion < 1) throw failure();
}

export function requireQaAcceptanceGrant(value: unknown): QaAcceptanceGrant {
  validateGrant(value as QaAcceptanceGrant);
  const grant = JSON.parse(JSON.stringify(value)) as QaAcceptanceGrant;
  return Object.freeze({ ...grant, binding: Object.freeze({ ...grant.binding }) });
}

async function privateParent(path: string, runId: string) {
  if (!isAbsolute(path) || basename(path) !== `qa-acceptance-${runId}.jsonl`
    || await realpath(dirname(path)) !== dirname(path)) throw failure();
  const stat = await lstat(dirname(path));
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) throw failure();
}
async function checkFile(file: FileHandle) {
  const stat = await file.stat();
  if (!stat.isFile() || stat.uid !== process.getuid?.() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0 || stat.size > MAX_JOURNAL_BYTES) throw failure();
}
async function syncParent(path: string) {
  const directory = await open(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY);
  try { await directory.sync(); } finally { await directory.close(); }
}

async function hasStopIntent(path: string) {
  try { await lstat(path + ".stop"); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

/** Read-only startup eligibility, before credentials or SQL. This never creates
 * or resets a run; a busy/incomplete read fails closed. enter rechecks under lock. */
export async function verifyQaAcceptanceJournal(path: string, grant: QaAcceptanceGrant) {
  validateGrant(grant); await privateParent(path, grant.runId);
  if (await hasStopIntent(path)) throw failure();
  try { await lstat(path + ".lock"); throw failure(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    await checkFile(file);
    const state = replay(await file.readFile("utf8"), grant), now = Date.now();
    if (state.active || state.stopped || state.calls >= 2 || now < state.lastAt || now < grant.activatedAt || now >= grant.expiresAt) throw failure();
  } finally { await file.close(); }
}

function replay(raw: string, grant: QaAcceptanceGrant) {
  if (!raw.endsWith("\n")) throw failure();
  const entries: Entry[] = raw.slice(0, -1).split("\n").map(line => JSON.parse(line));
  if (!entries.length || entries[0].kind !== "authorized" || acceptanceDigest(entries[0].grant) !== acceptanceDigest(grant)) throw failure();
  let active: string | null = null, activeDispatch = false, stopped = false, calls = 0, lastAt = grant.activatedAt;
  const turns = new Set<string>(), attempts = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!record(e) || e.sequence !== i || !Number.isSafeInteger(e.at) || e.at < lastAt || e.at < grant.activatedAt) throw failure();
    lastAt = e.at;
    if (i === 0) { if (!exact(e, ["sequence", "at", "kind", "grant"])) throw failure(); continue; }
    if (stopped || !uuid(e.operationId)) throw failure();
    if (e.kind === "enter") {
      if (active || !exact(e, ["sequence", "at", "kind", "operationId"])) throw failure(); active = e.operationId; activeDispatch = false;
    } else if (e.kind === "dispatch") {
      if (active !== e.operationId || activeDispatch || !uuid(e.turnId) || !uuid(e.attemptId) || !hash(e.requestDigest)
        || !exact(e, ["sequence", "at", "kind", "operationId", "turnId", "attemptId", "requestDigest"])
        || turns.has(e.turnId) || attempts.has(e.attemptId) || e.at >= grant.expiresAt) throw failure();
      turns.add(e.turnId); attempts.add(e.attemptId); calls++; activeDispatch = true;
      if (calls > 2) throw failure();
    } else if (["success", "empty", "stopped"].includes(e.kind)) {
      if (active !== e.operationId || !exact(e, ["sequence", "at", "kind", "operationId"])) throw failure();
      if (e.kind === "success" && !activeDispatch || e.kind === "empty" && activeDispatch) throw failure();
      active = null; if (e.kind === "stopped") stopped = true;
    } else throw failure();
  }
  return { entries, active, stopped, calls, lastAt, turns, attempts };
}

/** Explicit, exclusive initialization by the existing journal owner, only after
 * its separate authorization/activation gates. Never called by open/restart. */
export async function initializeQaAcceptanceJournal(path: string, grant: QaAcceptanceGrant) {
  validateGrant(grant); await privateParent(path, grant.runId);
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    await file.writeFile(JSON.stringify({ sequence: 0, at: grant.activatedAt, kind: "authorized", grant }) + "\n");
    await file.sync(); await syncParent(path);
  } finally { await file.close(); }
}

/** Existing file only. Truncation, bad records, mismatched source/configuration,
 * unresolved invocation or abandoned lock all fail closed, never auto-reset.
 * The lock has no expiry/recovery/delete API: a crashed holder requires the
 * original owner's explicit reconciliation, not PID/clock based stealing. */
export function openQaAcceptanceJournal(path: string, supplied: QaAcceptanceGrant): QaAcceptanceControl {
  validateGrant(supplied);
  const grant: QaAcceptanceGrant = JSON.parse(JSON.stringify(supplied));
  const binding = Object.freeze({ ...grant.binding });
  return Object.freeze({ binding, async requestStop() {
    await privateParent(path, grant.runId);
    let marker: FileHandle;
    try { marker = await open(path + ".stop", constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return; throw error; }
    // A root that has no lease still needs a durable veto while another worker
    // owns the attempt lock. Existence (even an incomplete/error marker) denies;
    // no code removes it. It never changes the active Turn, answer or money hold.
    try {
      await marker.writeFile(JSON.stringify({ schemaVersion: "qa-acceptance-stop/1", runId: grant.runId,
        grantDigest: acceptanceDigest(grant), reason: "root_unavailable" }) + "\n");
      await marker.sync(); await syncParent(path);
    } finally { await marker.close(); }
  }, async enter(signal: AbortSignal) {
    if (signal.aborted) throw failure();
    await privateParent(path, grant.runId);
    if (await hasStopIntent(path)) throw failure();
    // Original journal file is the authority. This separate exclusive lock only
    // serializes read/append/physical-send/usage/settlement as one whole attempt.
    const lockPath = path + ".lock";
    const lock = await open(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    let file: FileHandle | undefined, released = false, poisoned = false;
    const unlock = async () => {
      if (released) return; released = true;
      try {
        // Every durability/close step that can fail happens while the lock still
        // exists. In particular NEVER unlink and then fsync the directory: an
        // fsync error would report failure after making a success log executable.
        if (!poisoned) await syncParent(path);
        await file?.close(); await lock.close();
        // Unlink is the final release operation; do not perform fallible work
        // afterwards. A crash may resurrect an un-fsynced deletion, which only
        // stops the run conservatively. An unlink refusal leaves the lock intact.
        if (!poisoned) await unlink(lockPath);
      } catch (error) {
        poisoned = true;
        await file?.close().catch(() => {}); await lock.close().catch(() => {});
        throw error;
      }
    };
    try {
      try { await syncParent(path); } catch (error) { poisoned = true; throw error; }
      file = await open(path, constants.O_RDWR | constants.O_APPEND | constants.O_NOFOLLOW);
      await checkFile(file);
      const raw = await file.readFile("utf8");
      const state = replay(raw, grant);
      const { entries, active, stopped, calls, turns, attempts } = state;
      let lastAt = state.lastAt;
      const now = () => {
        const at = Date.now();
        if (!Number.isSafeInteger(at) || at < lastAt || at < grant.activatedAt) throw failure();
        return at;
      };
      if (active || stopped || calls >= 2 || signal.aborted || now() >= grant.expiresAt || await hasStopIntent(path)) throw failure();
      const operationId = randomUUID(); let dispatched = false, finished = false;
      let writes = Promise.resolve();
      const append = (entry: Omit<Entry, "sequence" | "at">) => {
        writes = writes.then(async () => {
        try {
          const e = { ...entry, sequence: entries.length, at: now() };
          const line = JSON.stringify(e) + "\n";
          if ((await file!.stat()).size + Buffer.byteLength(line) > MAX_JOURNAL_BYTES) throw failure();
          await file!.writeFile(line); await file!.sync();
          entries.push(e); lastAt = e.at;
        } catch (error) { poisoned = true; throw error; }
        });
        return writes;
      };
      await append({ kind: "enter", operationId });
      return Object.freeze({
        async beforeDispatch(input: Readonly<{ turnId: string; attemptId: string; requestDigest: string }>) {
          if (finished || dispatched || signal.aborted || now() >= grant.expiresAt || !record(input)
            || !exact(input, ["turnId", "attemptId", "requestDigest"]) || !uuid(input.turnId) || !uuid(input.attemptId)
            || !hash(input.requestDigest) || turns.has(input.turnId) || attempts.has(input.attemptId) || await hasStopIntent(path)) throw failure();
          // Durable intent BEFORE physical send. A crash consumes this slot and
          // stops the run; it never means the provider request was not received.
          dispatched = true;
          await append({ kind: "dispatch", operationId, ...input });
          if (signal.aborted || now() >= grant.expiresAt || await hasStopIntent(path)) throw failure();
        },
        async finish(outcome: "success" | "empty" | "stopped") {
          if (finished) throw failure(); finished = true;
          try {
            const kind = await hasStopIntent(path) ? "stopped" : outcome === "success" && dispatched ? "success" : outcome === "empty" && !dispatched ? "empty" : "stopped";
            await append({ kind, operationId });
          } finally { await unlock(); }
        },
      });
    } catch (error) { await unlock(); throw error; }
  } });
}
