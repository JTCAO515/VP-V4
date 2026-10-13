# QAWEB 原 hosted worker 最小受控恢复包（仅准备）

当前真实基线来自 JT / Main：香港 ECS `i-j6c7q3kftufyroypiqvu`；`/opt/vp-v4` clean、旧短 SHA `54c8da9a`（完整 SHA/分支执行前读回）；Docker Server29.1.3；`docker ps -a` 空；`/run/vp-worker-secrets` 缺失；`/etc/visepanda`、持久 journal 目录存在。固定 Staging `dzqdzetcctkhbrhlxxgn` 的原 hosted switch=false、heartbeats/ready/leased=0；仅75/155迁移，QA RPC缺失。没有 worker 或 provider 就绪结论。下述命令没有在 ECS/目标库执行。

1. **代码和镜像。** Main 的 PR正常保护合并且最终审阅/CI通过后，提供完整合并 SHA、目标迁移清单、镜像构建契约。先核云实例ID、架构、实际完整HEAD/branch和dirty；仅干净main且能快进才复用原checkout。存在用户改动、detached/其他分支或不能ff时保留原目录，由Main选择新checkout，不reset/覆盖。镜像绑定完整SHA并记录实际imageID/base digest/架构，不安装额外服务、不以未审PR head运行。

   ```sh
   # Operator在实际ECS受控窗口；VP_QA_MERGED_SHA来自Main完整合并pin
   hostname
   uname -m
   git -C /opt/vp-v4 status --short --branch
   git -C /opt/vp-v4 rev-parse HEAD
   docker version --format '{{.Server.Version}}'
   docker ps -a --format '{{.Names}} {{.Status}}'
   # 上述判据通过且目标checkout确认为main后才执行：
   git -C /opt/vp-v4 fetch origin main
   git -C /opt/vp-v4 merge --ff-only "$VP_QA_MERGED_SHA"
   test "$(git -C /opt/vp-v4 rev-parse HEAD)" = "$VP_QA_MERGED_SHA"
   # VP_QA_PLATFORM仅依据实测uname映射linux/amd64或linux/arm64
   docker build --platform "$VP_QA_PLATFORM" -f /opt/vp-v4/deploy/hosted-worker/Dockerfile \
     --build-arg "BUILD_ID=$VP_QA_MERGED_SHA" -t "vp-hosted-text-worker:$VP_QA_MERGED_SHA" /opt/vp-v4
   docker image inspect --format '{{.Id}} {{.Architecture}}' "vp-hosted-text-worker:$VP_QA_MERGED_SHA"
   ```

2. **QA-only profile和安装器闸门。** 用实际代码 `parseQaHostedProfile` 验证闭集 `vpj07-hosted-text-worker/3`：modes仅`qa_session_history_v1`、planning=null，有限poll/lifetime/drain/concurrency/groupLimit，实际configurationId/version、priceVersion、费率、reserve/output/timeout来自Main已审配置，不能复制过期价目或编造值。SQL发现必须恰好一个有效QA owner scope/provider model/priceVersion；groupLimit不是owner授权。**4e预览源码的安装器v3缺口已有Main本地源候选 `a21202455b09eb2b953224e840f5bb8216ab689d`：仅新增显式 `preflight --qa` / `start <SHA> --qa`，该非planning模式调用新 `validate-qa-profile.py`，原S1/planning验证分支保留。必须经本PR最终独立审阅、CI和正常保护合并，且最终合并pin确实包含该接缝后才可用；本地commit不等于ECS安装完成。QA宿主使用既有Python3，不需要新增宿主Node；worker的Node运行时在既有Docker镜像内。** 固定名`vp-hosted-text-worker`仅在fresh容器列表仍空时可复用；出现容器或其他owner工作即停并协调，不替换。

3. **安全凭据和存储。** `db.key`只能是指定Staging的授权service-role/secret key（project-wide、可绕RLS，不是publishable或细粒度权限）；`qwen.key`由原安全holder绑定实际provider业务空间/北京端点/模型权限、IP及计费边界。只通过目标ECS受控渠道导入，禁止聊天发值、Git/日志/env-file/Docker Config.Env存值。原文件模式要求`/run/vp-worker-secrets`在Linux tmpfs、uid/gid1000:1000目录0700，两文件0400/单硬链接/1–4096bytes；swap off。持久journal uid/gid1000:1000/0700，private profile root:root/0600。仅输出布尔或元数据预检：

   ```sh
   findmnt -T /run -no FSTYPE
   swapon --show --noheadings
   test -d /run/vp-worker-secrets && echo 'secret-dir: present' || echo 'secret-dir: absent'
   for f in db.key qwen.key; do
     test -f "/run/vp-worker-secrets/$f" && echo "$f: present" || echo "$f: absent"
   done
   stat -c '%u:%g:%a' /var/lib/vp-worker/journal
   # 不cat密钥；目标槽到位后由原文件模式做无值权限/大小/tmpfs预检。
   ```

4. **目标先合法ready，再启动。** Main按实际75/155前置差异审迁移顺序，逐项核目标RPC/constraint；不盲apply全仓库。新不可变QA policy/noticeHash、普通authenticated路径下的真实同意、明确测试actor及唯一合法budget scope/provider限额必须就绪。保持原global switch=false和`VERCEL_ENV`拒绝；file-mode进程启动前与首个真实heartbeat都必须观察disabled。安装器v3接缝已审并合并、源/镜像/profile/安全槽预检全通过后，operator才在授权窗口执行 `bash /opt/vp-v4/deploy/hosted-worker/ecs-worker-files.sh preflight --qa` 及 `bash /opt/vp-v4/deploy/hosted-worker/ecs-worker-files.sh start "$VP_QA_MERGED_SHA" --qa`，并核fresh workerId/build/disabled heartbeat与私有journal。这些是条件满足后的原固定名file-mode命令，目前未执行。Healthy只证明心跳，不证明provider。再受控enable，QA Web开关/policy由sole Vercel writer按Main具体包设置，执行六步有界真实多轮；不自动开启其他模式。

5. **停止、回滚、对账。** 出错先在原授权SQL入口disabled，停止新领取；原容器SIGTERM按现有75s/drain约定收尾。保留镜像、journal、原turn/request IDs及未决holds；不删除迁移/用户记录、不把unknown ACK当免费重试。仅经Main核旧profile/SQL兼容性后才能退回具体旧镜像，不能拿旧v1/v2处理新QA模式。实际usage收据需与原attempt/派发/settlement逐笔对应；缺usage、未知价格或ACK保留pending并走原reconciliation，不release成0、不新建request掩盖。关闭QA flag属于对应QA分支回滚，其他生产/staging不改。

**需JT / Main集中决定，当前没有自动执行授权：** 现有可撤销Staging凭据的安全holder交接或新建凭据的精确账号权限；Qwen业务空间/IP/模型与实际费用/stop-loss窗口；当前磁盘加密、备份/journal与core-dump/tmpfs/swap安全事实（历史记录不能当当前）；目标迁移/policy/budget写窗口与真实测试actor；v3安装器接缝、最终合并SHA/image/base digest。Sidecar草稿已STOPPED，不启用。没有ECS登录/改动、密钥/账号操作、预算/目标DB写入或真实模型调用。

源候选核验：部署侧只读核对a212的显式QA参数路由与Python验证器（闭集v3、重复key/未知字段/明显秘密前缀priceVersion及不足保守预留拒绝）；Main报告QA+原S1定向2PASS、原QA profile2PASS及Bash/Python语法通过，部署侧复用该证据未重跑。ECS/凭据/目标SQL/provider仍UNRUN。


## 本轮确切 pin 与一次集中审批前检查清单（16018dd2）

仅绑定源码 `16018dd23f3546a2be8acd81d5f85c4754d9845d`；当前Main报告两个P1和UI P2返修、CI/review未收敛，因此不可作为最终启用pin。源码文件hash见 `source-pins-16018dd2.json`，任何相关源码/迁移/notice/tariff变化需Main重审包hash，不沿用旧批准。此清单没有生成或执行目标写入命令。

| 前置项 | 已知证据 / 剩余动作与权限 |
| --- | --- |
| QA预览与外层关闭 | 自动部署 `dpl_4RokMsjVow4qL8tMB15vMwfUzmZs` READY同SHA/QA branch/alias；仅Origin变量、QAFLAG/policy/context缺失，root307、qa/signin200、匿名503及foreign-Origin403实测PASS。不启flag。 |
| 最终源码/镜像 | Main修review问题、通过原保护CI/merge并给完整最终SHA；ECS checkout/image/profile必须绑定该最终pin，不以当前候选替代。 |
| 固定目标与恢复点 | 仅Go2China `dzqdzetcctkhbrhlxxgn` / 官方link `link_6acdbe0471c081919ff47de24ca53b0f`；Main核actual备份/可恢复证据及hash。备份启动或本地回放不是目标恢复点。 |
| 75→155与schema | manifest SHA256 `f0e96cbcbdf4941f36c522e7faf6b7a22d24974412c1c91dc29076cfd91a9f1c`，75 baseline+80 reviewedMissing=155，155源码hash逐项匹配PASS；目标应用/完整版本顺序/QA及lifecycle schema fingerprint仍须Main目标证据，不能盲apply。 |
| QA新迁移 | `20261013050429_qa_agent_web.sql` SHA256 `df5565ae49363dc83d4e0db9686653d43dc79cb2b011e4d56e343f45d654afa9`；本轮未target apply，后续hash变更须重pin。 |
| 新discovery与ACL | v3只调用 `public.qa_ready_groups_v1(integer)`；源码仅service_role EXECUTE，PUBLIC/anon/authenticated撤销；legacy v1/v2保留 `hosted_worker_ready_groups`。目标同签名/ACL/fingerprint需实际读回；不得向浏览器grant或用旧discovery代替。完整QA用户RPC与worker RPC ACL按Main metadata.sql/回放fingerprint核验。 |
| 新policy与双语同意 | 新UUID/version、完整zh/en disclosure及canonical noticeHash、准确recipient/endpoint/currentness；旧policy/consent不复制。policy没有enabled列，插入有效policy是独立publication，不用先revoked再清撤销。实际测试actor通过普通登录/`qa_accept_policy_v1`接受精确hash，账号认证/同意验收仍UNRUN。 |
| 新预算与费用 | 新scope/provider-limit先disabled；owner/model/currency/priceVersion一致且仅一个有效匹配scope。JT集中批准实际总cap、attempt/task/provider限额、过期和物理调用窗口后才enable。价目候选不能代替资金授权；原预留包含1,048,576输入基数，公开价目十进制1M覆盖及附加/缓存费用尚需Main判定。未知值不填合成数据。 |
| 公开价目候选 | `supplier-price-candidate.json` hash `18fa230a95448472c44bcecf7a613113c95a48af6528a851792e5169c993fe60`，UNPUBLISHED_DISABLED / activationAllowed=false；owner/configuration/caps/有效期及coverage未齐。沿Main现有离线generate/preflight产出精确包hash，目标observation ≤1h和来源复查期限须实际满足。offline reviewReady不是运行权限。 |
| 安全holder/宿主 | 原ECS `i-j6c7q3kftufyroypiqvu`、固定container当前空、switch disabled/0 workers基线执行前重读。仅原holder受控交接Staging service-role db.key及Qwen业务空间计费key；tmpfs/swap/private profile/journal按前文布尔预检。新key/账号权限或费用须纳入同一JT批准包，不聊天传值、不存Docker env、不新增paid资源。 |
| 安装与endpoint P2 | 原 `--qa` v3 Python验证候选已在源中，宿主无新增Node需求；Main另修profile之外的已审endpoint传递，workspace endpoint未正确绑定会跳过所有group。必须最终source/profile/policy/进程endpoint完全一致，不伪造ready或自行替换provider/region。 |
| 最后受控启用与回滚 | 只在上述真实条件齐备、最终review/CI/merge、精确变更包及费用/窗口批准后，按原file-mode disabled启动→fresh heartbeat→受控scope/provider/worker/Web enable；记录原reserve/dispatch/usage/settlement。先完成正常账号认证、真实Session隔离/持久化及有限多轮，unknown ACK/pending按原reconciliation保留，不免费重试。 |

一次集中批准包须由Main填齐真实 **finalSHA/imageID + restore证据 + migration/schema/ACL hash + new policyId/noticeHash + test actor + new scope/provider限额/币种/expiry + secure holder来源（无密钥值）+ endpoint/region + 最大付费调用窗口/stop-loss + stop/rollback责任人**。缺项保持disabled，不以本清单或文件自造批准。当前无ECS/密钥/targetSQL/预算/provider操作，sidecar保持STOPPED。
