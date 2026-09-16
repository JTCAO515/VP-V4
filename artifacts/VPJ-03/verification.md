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

## 2026-09-16 数据披露矩阵复核（分支 `worktree-agent-a150dd97bcf6cc53a`，基线含 PR #416/#375）

对 `docs/policy/vpj-03-data-disclosure.md`（2026-09-14 合入，PR #375）逐条对照 Issue #190 四条验收标准，
用只读命令核对当前代码是否仍支持文中结论；未运行任何供应商调用、迁移或权限变更。

1. **告知矩阵（第1条）**：抽查文中引用文件存在且内容一致——`docs/contracts/privacy-lifecycle.md`、
   `lib/server/media/private-media.ts`、`lib/server/model-gateway/`。`preparePrivateMediaUpload` 与
   `preparePrivateMediaDeletion`（`lib/server/media/private-media.ts:25-52`）在当前代码中**始终**返回
   `{ kind: "media_unavailable" }`，与文档第8节一致。
2. **经营主体/Owner权限（第2条）**：`grep -rln ops_reader supabase/migrations/` 无匹配，确认应用层不存在
   跨用户客服读取角色，与文档第7节一致。
3. **材料两路径（第3条）**：同上第8节验证；文本Ask/Trip流程不依赖材料上传，未发现强制材料上传的路由。
4. **第三方AI接收方（第4条，本轮发现需更新）**：`grep -rn "createProviderHttpTransport" .` 发现
   `lib/server/jobs/wiki-generation-job.ts`、`wiki-search-job.ts`、`wiki-statement-proposal-job.ts`、
   `staging-text-job.ts`（VPJ-75/76，均晚于PR #375合入）已复用 `lib/server/model-gateway/adapters/http-transport.ts`
   这一**真实**HTTP传输层（`fetcher(config.endpoint, { method: "POST", ... })`，`ENDPOINTS` 表指向
   `dashscope.aliyuncs.com`/`open.bigmodel.cn`/`api.deepseek.com` 真实域名）。原文档"只是TypeScript fixture"
   的表述因此过期。进一步核实：
   - `grep -rn process.env lib/server/model-gateway/` 及对四个 job 文件同样检索：均无匹配，模块自身不读取
     环境变量／密钥。
   - `grep -rln "createProviderHttpTransport" .`（排除 node_modules）：只有上述四个 job 文件与两个测试文件
     （`tests/contract/...`、`tests/integration/...`）引用；`grep -rln "from .*jobs/wiki-...-job" .` 显示
     应用侧仅 `lib/server/knowledge/wiki/grounded-search.ts` 引用 `wiki-generation-job`，未发现 `app/api/**`
     或 `scripts/**` 下任何路由/脚本调用这四个 job 并注入真实密钥。
   - 未找到 `.env.example` 文件；`grep -rln "DEEPSEEK\|DASHSCOPE\|BIGMODEL"`（排除 node_modules/test）无匹配，
     仓库未声明任何供应商 API Key 环境变量名。
   - 结论：真实供应商调用能力**已具备**（传输层代码可用），但**没有任何可达调用路径**为其注入真实凭据，
     因此"当前零真实供应商调用"结论仍然成立，只是理由从"代码不存在"变为"代码存在但未接线"。已更新
     `docs/policy/vpj-03-data-disclosure.md` 第4节措辞以反映这一区别，并记录 `ops_wiki_generation_v1`
     等派发队列表已建，但驱动其调用的 worker/cron 入口本仓库尚不存在，属真实集成缺口。

本轮命令（均只读，见对应 grep/find/ls 调用，未记录到 commands.jsonl 因该文件不属于本次改动范围）：
`grep -rn process.env lib/server/model-gateway/`、`grep -rln createProviderHttpTransport .`、
`grep -n media_unavailable lib/server/media/private-media.ts`、`grep -rln ops_reader supabase/migrations/`、
`find app/api/privacy -maxdepth 2 -type f`、`grep -rln "DEEPSEEK\|DASHSCOPE\|BIGMODEL" .`。
未读取任何凭据、用户数据或供应商响应；未发起网络请求；未修改运行时代码、迁移或权限。
