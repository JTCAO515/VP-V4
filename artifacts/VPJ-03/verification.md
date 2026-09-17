# VPJ-03 文本决定准备

2026-09-09，基线main0cea386。有界文档准备：把既有合同收敛成合成对照与真实文本Ask两包，实际字段均decision_required；中英告知只是不可发布的待填结构，材料两路径保持未开启。

独立只读审阅确认现有合同无可复用的真实经营主体/接收方/地区/期限授权。来源与运行限制在docs/policy/vpj-03-text-decisions.md。未读取凭据/用户数据，未调用provider或改变权限；不会将模板合并当VPJ-03通过。

验证：docs:check、提交范围diff检查；纯文档不重复无关运行测试，既有必需CI仍是PR合并门。用户被请求提供现有服务/地区及预算线索；未答项继续decision_required，明确调用授权仍在核验之后。

## 2026-09-11 供应商资格与留存告知准备

基线main `26669d9ffa595bb069b81e6faa4031568c1cea0e`；隔离工作树。
新增三家一手来源矩阵及中英告知审阅稿，修正旧表“留存尚未实施”与VPJ-07已验证本地实现的差异。
Qwen百炼协议2026-09-02签约实体是通义云启（杭州）信息技术有限公司，个人账号不等于个人Token Plan；
不能套用统一不训练承诺。三家精确正文TTL/账号适用性仍未通过，C0没有被扩展成C2授权。
公开网页读取成功；Qwen协议web工具重复读取超时后，通过公开URL直接读取HTML核对§1.1、§5.2。
没有读取凭据、供应商原始回答或用户正文，没有模型调用、migration、权限激活、外部消息或生产动作。

本轮执行检查见commands.jsonl。仅文档检查和diff检查适用；原生、SQL与provider行为未修改，不重复原生测试。
现有必需CI仍须在本PR准确HEAD通过后方可合并；完整#190继续开放。

## 2026-09-16 PR #418 审阅修正

原复核的“没有可达入口/零真实调用”结论被否决：检索遗漏了 lib/server/jobs 下的两个运行入口，
也遗漏了既有 Staging 与 Wiki 的真实 Qwen 证据。该结论不作为有效验收；没有据此关闭 #190。

实际只读核对：

- `lib/server/jobs/run-staging-text-worker.mjs` / `run-staging-text-service.mjs` 的环境凭据回调、配置绑定和调用链。
- `lib/server/jobs/staging-text-job.ts`、`lib/server/model-gateway/adapters/http-transport.ts` 的真实传输与隔离边界。
- `artifacts/VPJ-07/staging-live-20260912/verification.md`、`artifacts/VPJ-75/359-wiki-dispatch-slice2-20260914/verification.md` 的历史实测范围。
- `artifacts/VPJ-74/restore-rehearsal-20260914.md` 已有数据库地区记录；本轮没有将历史记录冒充实时配置查询。
- `withdraw_text_policy` 与 native consent DELETE 已存在；通用 `/api/privacy` 仍为请求登记，二者不能混同。
- 媒体 prepare 路径仍返回 unavailable；未核验完整材料链和全模块删除。

数据披露第3–5节及Q36关联说明据此纠正，去除重新引入的供应商审批门。原错误结论保留在PR历史中。
本轮未读取秘密、未发模型请求、未执行迁移或变更运行权限。验证结果在本PR最终提交与CI中记录。

## 2026-09-17 关闭复核：实际 registry、部署与策略一致性

基线 `origin/main@ffcd194`。本轮通过官方 Supabase Management API 在明确的 `VP - V4`
Staging project 上执行只读 policy inventory；项目健康且地域为 Singapore。Vercel 项目
`vp-v4` 只读元数据显示函数默认区域为 `iad1`，production 环境存在 Testing Chat 的开关、
policy ID 与受保护凭据名称，但 main 并不包含该 Testing Chat 路由。

只读 inventory 发现一条有效 GLM `internal-testing-v1` policy。其 immutable registry 的
recipient/source/processing/storage region 与 notice、Vercel/Supabase 实际路径不一致，且
对应路由只存在于未合入 main 的 `testing-chat-vpv4`。这不满足“实际接收方/地域与中英告知一致”
的验收，不能用文档粉饰。通过精确 `id`、仍有效及未撤回三个条件执行一次终态
`revoked_at` 更新，返回恰好一行；没有读取密钥、用户正文或同意记录，也没有删除数据。
policy registry 的现有授权检查因此会在外发前拒绝旧 policy。

再次读取 inventory：没有未撤回、未过期且通过本票完整性核验的 C2 text policy。对被撤销 policy
通过现有 `turn_private.text_policy_current()` 的短事务、立即 `ROLLBACK` 检查返回 `false`；最初
`READ ONLY` 事务被该函数内部 `FOR SHARE` 正确拒绝，失败原因已保留而非改写为通过。历史 Qwen
Staging 与 Wiki 调用仍作为历史真实接收方证据保留；它们不等于当前生产流量。数据披露矩阵
已改为记录运营主体、长期 hide-not-erase 文本语义、当前 Vercel/Supabase 地域、历史接收方、
团队访问未启用、材料两路径和完整 Q36 scope/来源/版本/接收方/撤回边界。

本次适用验证：官方 CLI policy inventory/terminal revoke/re-read/current-check、Vercel 项目与环境名称
只读检查、源码入口/部署分支追踪、`pnpm docs:check`、`git diff --check`。完整命令和脱敏
结果在 `artifacts/VPJ-03/closure-20260917/`。不以回退旧 policy 作为 rollback；若未来启用，
必须新建 immutable policy 并取得新 consent。

额外运行 `node scripts/vpj-program.mjs verify-remote`：**FAIL（与本票无关）**。远端 Issue
关系已漂移：#188/#191/#193 的依赖与当前 manifest 的 VPJ-04…07 断言不一致。此命令在
`docs:check` 通过后失败；本票没有修改 manifest 或这些 Issues，未将它们的 tracker 修复混入
本 PR，也不把失败掩盖为 #190 通过。
