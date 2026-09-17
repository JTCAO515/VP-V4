# VPJ-02 current Staging verification

Related to [#189](https://github.com/JTCAO515/VP-V4/issues/189), S1. This tool delivers a repeatable
migration inventory and real two-user owner isolation matrix on the previously designated
**VP - V4 / Singapore** Staging. It never applies migrations or changes grants, roles, configuration,
provider work, Production or the TripProposal confirmation contract.

## Prerequisites and commands

Run from the repository root with Node 22+ and an authenticated Supabase CLI (observed 2.117.0).
`VPJ02_SUPABASE_BIN` optionally names the locally verified CLI executable. No credential is supplied
on the command line. Verify the current account with `supabase projects list`; a browser or another
connector's login does not establish CLI access. The hardcoded target is intentional: a different
project needs a reviewed scope change, not a new flag value.

Read-only inventory (does not request API keys):

```sh
node scripts/db/vpj-02-staging-verify.mjs inventory dzqdzetcctkhbrhlxxgn
```

The matrix uses the existing same-target authorization for exactly two ordinary synthetic Auth users
and their empty Trips. Use a **new**, absolute private directory outside every checkout for each run:

```sh
node scripts/db/vpj-02-staging-verify.mjs matrix dzqdzetcctkhbrhlxxgn /private/tmp/vpj02-unique-run
```

A private recovery journal is created before mutations; never commit it. It contains only reserved
IDs, synthetic emails, run markers and aggregate row digests, not passwords or tokens. Existing API
keys are captured from the CLI in memory. Passwords are randomly generated in memory; Admin create
with `email_confirm` sends no invitation. Each account authenticates through the real password token
endpoint and verifies its identity through `/auth/v1/user`. No fabricated JWT or `SET ROLE` is used.

The matrix checks both owners' create/read, reciprocal hidden reads, anon denied reads, forged-owner
inserts and owner/other/anon direct PATCH rejection. Direct PATCH is expected to fail for the owner too;
Trip changes still require the accepted confirmation flow. Empty Trip creation does not create a
proposal or exercise confirmation. All writes use reserved fixture IDs; original users are never used
as test actors. HTTP failures and unknown schema responses cannot satisfy denial checks.

## Cleanup and interruption

Normal completion or caught failure runs cleanup in `finally`: sign out the two sessions, verify the
exact user ID/email/run marker, verify each reserved Trip's owner/title/version, delete those exact
empty Trips and then the exact synthetic Auth users. Unexpected owned Trips block Auth cascade.
Independent cleanup attempts continue for the second identity after a first-identity failure.
A final read-only query verifies fixture users/Trips/sessions are absent and compares complete original
Auth/Trip row digests. Changes by another session cause a preservation FAIL; never restore old rows
or remove someone else's records to make the comparison pass.

After process/host interruption, retain the journal and run:

```sh
node scripts/db/vpj-02-staging-verify.mjs cleanup dzqdzetcctkhbrhlxxgn /private/tmp/vpj02-unique-run/journal.json
```

Recovery reads only recorded identities and never searches for deletion candidates by email prefix.
A create request is journaled before sending, so an unknown acknowledgement still has a reserved ID.
If the service returns an unexpected identity or ownership has changed, stop destructive cleanup and
investigate the private receipt. Do not widen filters. Recovery skips unrelated migration/UPDATE
acceptance gates. Without the in-memory token, recovery cannot claim an observed logout; exact Auth
deletion and the final zero-session check establish refresh-session removal, **not immediate expiry of
previously issued access JWTs**. No access token is persisted; fixture ownership disappears on cleanup.
Keep a failed journal until residual objects and original-data preservation are reconciled.

## Evidence and limits

Only sanitized JSON is printed. CLI/HTTP errors and response bodies never go to logs. Exit 1 means a
failed check or incomplete run; inspect the named checks and cleanup result, then diagnose without
printing credentials. `PASS_FOR_RECORDED_SCOPE` is not full Issue acceptance.

Migration evidence compares version/name, including the historical first24, with all current files.
It separately lists unapplied files, remote-only versions and name drift. It does not compare deployed
DDL/function source hashes. Public/private ordinary-table RLS inventory excludes other schemas/views.

The CLI linked query is a **Management API path**. Direct PostgreSQL, Session pooler and worker
connection identity each retain their own UNRUN status unless separately observed with the actual
connection. Do not present management SQL, role simulation or PostgREST JWT success as worker proof.
The tool does not discover/reset SQL passwords, disable TLS, apply pending migrations or enable a
worker. Historical successful pooler and failed direct-host evidence retain their dates.

Behavioral tests:

```sh
node --test tests/integration/db/vpj-02-verification.test.mjs
node scripts/docs-check.mjs
git diff --check
```

The adjacent `tests/integration/db` path is necessary for executable cleanup/security regression
coverage and is automatically collected by the existing integration suite. Mock transport tests
prove tool behavior only; real Staging matrix output is recorded separately under `artifacts/VPJ-02`.

## 本机剩余连接验证：操作教程（2026-09-17）

当前网络实测：Session5432和Transaction6543通过官方CA及主机名校验的TLS1.2；direct5432
在TLS开始前断开。本机DNS为这些主机返回198.18/15代理地址，未观察到默认IPv6路由。
这不证明Supabase数据库故障；未调整代理、DNS、项目网络限制或付费IPv4配置。

请先完成可以独立验证的数据库登录：

1. 在自己的密码管理器中找到 **VP - V4项目创建时保存的数据库密码**。这不是GitHub/Supabase
   网页登录密码，不是API key。控制台`Database → Settings → Database password`明确说明原密码
   不可查看；重置会影响已有连接。找不到时回复“未找到数据库密码”，先评估受控重置，不试猜。
2. 打开macOS“终端”，复制运行下方命令。此路径是当前独立工作区；脚本也可在仓库根目录以相对
   路径执行。需要Python3和psql，本机已验证具备。

   ```sh
   python3 "/Users/jtsm5p/Documents/ChatGPT/VP-V4-staging-verification/scripts/db/vpj-02-connection-check.py"
   ```

3. 出现`输入 VP - V4 数据库密码`提示后，粘贴数据库密码并按回车。**输入时没有字符或星号显示，
   这是正常现象**。脚本拒绝非交互回显降级。不要把密码放在命令后、截图或聊天中。
4. 等待约10–60秒。程序只运行只读事务，校验实际数据库/会话身份、迁移版本、聚合数量及撤销的
   UPDATE权限。密码仅传给本次psql子进程的内存环境，不写入文件、命令参数或shell历史。
   结果文件自动保存到`artifacts/VPJ-02/staging-verification-20260917/connections-*.json`。
5. 回到任务只回复“连接验证已执行”。无需粘贴输出，agent会读取本机脱敏结果。若状态INCOMPLETE或
   退出码1，请保留结果；直连网络失败不会阻止另外两条TLS已通过的pooler路径验证。认证错误会停止
   后续密码尝试，避免连续错误登录。Ctrl+C可退出。

脚本使用连接面板实际给出的主机和用户名，`psql -X -w`禁用启动脚本/额外密码提示，强制
`verify-full`，不继承PGSERVICE/PGHOST等连接覆盖。官方CA下载内容固定SHA256；证书更新时停止并
重新核对，不能降级TLS。只需网络预检查时使用`--preflight`，它不索取密码。

真实worker仍单独验收：ADR-0016的SystemDataAdapter契约使用共享transaction6543且不允许命名
prepared statements；当前源码未找到已部署的该SQL adapter。现有Staging text worker是另一条有
provider/budget/claim语义的执行链。这里只读SQL连接通过不等于运行worker，也不会启动模型任务、
模拟`SET ROLE`或扩大账号权限来填补此项。

参考：[连接方式](https://supabase.com/docs/guides/database/connecting-to-postgres)、
[官方SSL/CA说明](https://supabase.com/docs/guides/platform/ssl-enforcement)。
