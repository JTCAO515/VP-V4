// Create two owned, ordinary Staging identities for a bounded Ops test.
// Credentials and Auth tokens are never logged or committed. The recovery
// journal is age-encrypted before each external mutation.
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requestFactory, STAGING } from "../db/vpj-02-verification-core.mjs";

const directory = "/Users/jtsm5p/.codex/secure-backups/vpj-75-76-staging";
const identity = join(directory, "20260919T073953Z-87d3a1dc.agekey");
const journalPath = join(directory, "ops-actors-20260919.age");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function cli(args) {
  const r = spawnSync("supabase", [...args, "--output-format", "json"],
    { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 });
  if (r.status !== 0) throw new Error("CLI_FAILED");
  return JSON.parse(r.stdout);
}
function keyring() {
  const value = cli(["projects", "api-keys", "--project-ref", STAGING]);
  const entries = Array.isArray(value) ? value : value.keys ?? value.api_keys;
  const anon = entries?.find(k => k.name === "anon")?.api_key;
  const service = entries?.find(k => k.name === "service_role")?.api_key;
  if (!anon?.startsWith("eyJ") || !service?.startsWith("eyJ")) throw new Error("EXISTING_KEYS_UNAVAILABLE");
  return { anon, service };
}
function idHash(id) { return createHash("sha256").update(id).digest("hex").slice(0, 12); }
function save(journal) {
  const publicKey = spawnSync("age-keygen", ["-y", identity], { encoding: "utf8", timeout: 10000 });
  if (publicKey.status !== 0 || !publicKey.stdout.trim().startsWith("age1")) throw new Error("JOURNAL_KEY_UNAVAILABLE");
  const encrypted = spawnSync("age", ["-r", publicKey.stdout.trim()],
    { input: JSON.stringify(journal), timeout: 10000, maxBuffer: 1024 * 1024 });
  if (encrypted.status !== 0) throw new Error("JOURNAL_ENCRYPTION_FAILED");
  const temporary = `${journalPath}.${randomBytes(5).toString("hex")}.pending`;
  writeFileSync(temporary, encrypted.stdout, { mode: 0o600, flag: "wx" });
  renameSync(temporary, journalPath);
}
function readJournal() {
  const result = spawnSync("age", ["-d", "-i", identity, journalPath],
    { timeout: 10000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error("JOURNAL_UNAVAILABLE");
  const journal = JSON.parse(result.stdout.toString("utf8"));
  if (journal.project !== STAGING || !uuid.test(journal.run)
    || journal.users?.length !== 2 || journal.users.some(u => !uuid.test(u.id))) throw new Error("JOURNAL_INVALID");
  return journal;
}
function query(sql) {
  const result = cli(["db", "query", "--linked", "--project-ref", STAGING, sql]);
  if (!Array.isArray(result.rows) || result.rows.length !== 1) throw new Error("QUERY_FAILED");
  return result.rows[0];
}

if (process.argv.length !== 3 || !["init", "enable", "status"].includes(process.argv[2])) throw new Error("MODE_REQUIRED");
const mode = process.argv[2];
if (mode === "init") {
  if (existsSync(journalPath)) throw new Error("OWNED_RUN_EXISTS");
  const baseline = query(`begin read only; select
    (select count(*) from supabase_migrations.schema_migrations) as migrations,
    (select count(*) from auth.users) as users,
    (select count(*) from public.trips) as trips,
    (select enabled from knowledge_review_private.settings) as ops_enabled,
    (select count(*) from knowledge_review_private.members where active) as active_members;
    rollback;`);
  if (Number(baseline.migrations) !== 61 || Number(baseline.users) !== 7
    || Number(baseline.trips) !== 3 || baseline.ops_enabled !== false
    || Number(baseline.active_members) !== 0) throw new Error("STAGING_BASELINE_CHANGED");
  const run = randomUUID();
  const users = [0, 1].map(index => ({
    id: randomUUID(), email: `vpj75-${run}-${index}@example.invalid`,
    password: randomBytes(36).toString("base64url"), attempted: false,
    created: false,
  }));
  const journal = { project: STAGING, run, users, baseline: { users: 7, trips: 3, migrations: 61 }, opsEnabled: false };
  save(journal);
  const request = requestFactory(keyring());
  for (const user of users) {
    user.attempted = true; save(journal);
    const created = await request("/auth/v1/admin/users", { method: "POST", admin: true,
      body: { id: user.id, email: user.email, password: user.password, email_confirm: true,
        user_metadata: { vpj75_run: run } } });
    if (created.status !== 200 || created.body?.id !== user.id || created.body?.email !== user.email) throw new Error("USER_CREATE_FAILED");
    user.created = true; save(journal);
    const login = await request("/auth/v1/token?grant_type=password", { method: "POST",
      body: { email: user.email, password: user.password } });
    if (login.status !== 200 || login.body?.user?.id !== user.id
      || typeof login.body?.access_token !== "string") throw new Error("USER_LOGIN_FAILED");
  }
  console.log(JSON.stringify({ status: "TWO_REAL_AUTH_USERS_READY", project: STAGING,
    authorIdHash: idHash(users[0].id), reviewerIdHash: idHash(users[1].id),
    journal: journalPath, opsEnabled: false }));
} else {
  const journal = readJournal();
  if (mode === "enable") {
    if (!journal.users.every(u => u.created) || journal.opsEnabled) throw new Error("JOURNAL_STATE_INVALID");
    const [author, reviewer] = journal.users;
    const result = query(`begin;
      do $guard$ begin
        if (select count(*) from supabase_migrations.schema_migrations) <> 61
          or (select count(*) from auth.users) <> 9
          or (select count(*) from public.trips) <> 3
          or (select enabled from knowledge_review_private.settings) is distinct from false
          or (select count(*) from knowledge_review_private.members where active) <> 0
          or not exists(select 1 from auth.users where id='${author.id}'::uuid and email='${author.email}')
          or not exists(select 1 from auth.users where id='${reviewer.id}'::uuid and email='${reviewer.email}')
        then raise exception 'OPS_BASELINE_CHANGED'; end if;
      end $guard$;
      insert into knowledge_review_private.members(actor_id,active)
        values('${author.id}'::uuid,true),('${reviewer.id}'::uuid,true);
      update knowledge_review_private.settings set enabled=true where singleton=true;
      commit;
      select (select enabled from knowledge_review_private.settings) as ops_enabled,
        (select count(*) from knowledge_review_private.members where active) as active_members;`);
    if (result.ops_enabled !== true || Number(result.active_members) !== 2) throw new Error("OPS_ACK_UNKNOWN_VERIFY_REMOTE_STATE");
    journal.opsEnabled = true; save(journal);
  }
  const state = query(`begin read only; select
    (select count(*) from supabase_migrations.schema_migrations) as migrations,
    (select count(*) from auth.users) as users,
    (select count(*) from public.trips) as trips,
    (select enabled from knowledge_review_private.settings) as ops_enabled,
    (select enabled from knowledge_review_private.publication_settings) as publication_enabled,
    (select count(*) from knowledge_review_private.members where active) as active_members;
    rollback;`);
  console.log(JSON.stringify({ status: "OBSERVED", project: STAGING,
    authorIdHash: idHash(journal.users[0].id), reviewerIdHash: idHash(journal.users[1].id),
    ...state }));
}
