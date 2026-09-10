# Harness 实施状态

2026-09-10 已合并基线核对至 main `28a2d44`；本机同一Trip整合证据另见artifacts/VPJ-05，准确PR交付状态以审阅/CI记录为准，不是最终产品验收。本次在明确追加授权后实际执行Staging预算迁移及验证，结果见artifacts/VPJ-59/staging-20260910.md。

| 任务 | 事实与下一步 |
| --- | --- |
| VPJ-66 #263 | COMPLETED。PR271合并99f54c4，准确HEAD审阅与CI通过；合并后evals23/23、零skip；2正常fixture PASS、4故意故障预期FAIL。7项离线准备验收已勾选，证据comment5596131601。 |
| VPJ-67 #264 | OPEN，仍被VPJ-16 #206阻塞。VPJ-16依赖VPJ-07/15；VPJ-07依赖VPJ-04/05/06/59，继承真实身份、provider、预算和数据政策门。不能把66完成当只读真实问答完成。 |
| VPJ-68 #265 | OPEN，等待67、10、11、65；真实步行依据、完整晚餐锁、准确确认与持久重载尚未验收。 |
| VPJ-69 #266 | OPEN，等待68；真实任务取消/重连/提交核验尚未验收。 |
| VPJ-70 #267 | OPEN，等待67；离线配对报告、评分器与退化反例测试已由PR277合并272ca7d，审阅/CI及合并后10项专项通过。真实配对、预算、事前阈值与人工校准仍需对应条件；缺失时只报 evidence_insufficient。 |
| VPJ-71 #268 | OPEN，等待69、70、37、63；全部12场景required staging仍NOT_RUN。 |

## 阻塞边界

- VPJ-02 #189：PR281已合并85c2b98。获准原13+RPC修复迁移已实际执行，Staging11→25；新加密备份/断网恢复与普通JWT隔离16/16通过，精确清理后原有3Auth/2Trip摘要一致。新预算迁移20260909184816已获追加授权并执行，Staging现26条迁移；新备份恢复及40项预算/身份检查通过，精确清理后原数据保持一致。direct-host新只读探针仍失败，worker路径仍未验收。见artifacts/VPJ-02/staging-apply-20260910.md。
- VPJ-03 #190：PR282已合并d4eeb08，记录JT提供的服务入口、Qwen/GLM个人账号、经营主体、测试对象和三家合成推理授权；每家本轮累计≤CNY30、总计≤CNY90，不授权充值。DeepSeek账号类型未提供。JT已选择A，允许仅本轮完全虚构、无个人信息的文本按适用条款留存/模型改进；真实聊天保存/删除和人工访问规则未定。三家登录钥匙串条目均已检测到；DeepSeek此前进程环境变量后来不存在，用户已补录。条目存在不证明密钥有效或模型权限。见docs/policy/vpj-03-text-decisions.md。
- VPJ-01 #188：PR278合并f6928c8，准确HEAD审阅及Quality/Native CI通过；本地iOS26.5最终8单元+7UI通过，iOS17.5为8单元+3UI通过、4UI裁切审计失败。同设备基线对照复现中文banner及Tools既存失败，本次减少对比度问题；不能作为最低系统验收通过，最大字完整contrast诊断亦保留FAIL。PR300已记录用户确认的iPhone17真机实操PASS及9项设备导航/状态测试；真实VoiceOver及上述完整基础门仍未验收。已登录真实Trip的选区Ask/确认/重载属于#198及#233/#242联合验收，不反向阻塞#188；当前空Trip预览不能冒充这些消费者。
- VPJ-04 #191：基于PR279的JWT接缝，本机native v2已接通真实Profile→URLSession→Next→普通Auth/JWT→持久epoch/RLS。两台iOS26.5的6项身份测试、真实过期/刷新、顶替并发、旧RPC重放拒绝及Web Cookie/Origin均通过；全新本机26→27首次迁移及15函数原体保留已核验。身份链已由PR298合并。默认远端关闭，Staging仍26；17.5身份、真机身份、push及完整产品门未验，#191保持OPEN。本机同一Trip消费者证据见下一项。完整证据与保留失败见artifacts/VPJ-04/local-session/verification.md。
- VPJ-05 #192：PR301已合并28a2d44，准确HEAD审阅0/0，Native/Quality/Budget/Vercel通过，合并树一致。本机Web与Swift通过同一Trip ID双向创建/修改/确认/重载，草稿和CAS冲突保留、恢复提议确认/拒绝后按钮状态已实测。SQL28的receipt/digest权威与普通JWT/RLS对抗检查、真实27→28旧数据保留升级通过；user hard locks及外部订单仍unknown，远端未启用，#192保持OPEN。完整证据见artifacts/VPJ-05/verification.md。
- VPJ-06 #193：已有真实C0协议证据：三家主样本27/27、客户端超时/取消6/6、两个真实DeepSeek调用的重复worker/崩溃记账证明通过。GLM显式关闭思考导致400/1210，保留原生默认后实际9项样本通过；Qwen/DeepSeek各9样本通过。不同轮次输出上限分开记录，只有后两轮同4096；不把协议通过当语义质量/人工校准或模型采用。完整usage按最高公开费率的保守预算扣额0.035014CNY，8个不明费用请求保留28.9CNY预留，均非实际账单声明。真实profile/outcome消费者、地区/账单核验和语义质量仍待完成；见artifacts/VPJ-06/live-c0-20260910。

- VPJ-62 #202无形式任务依赖，但实际邮箱/同意/回执/退出涉及真实接收方与数据政策，且不在Harness主依赖链；不为绕开阻塞自动开放收集。

新代码不绕开RLS、确认、provider/接收方或发布门。继续上述已有契约支持的有界准备与修复；准备不得替代真实接口、授权或集成验收。各开发线使用独立工作树，provider与pairing目录互不抢改，准确HEAD审阅和必需CI通过后串行合并。

## 下一阶段真实链边界

[HF执行增量](hf-reuse/README.md)中的VPJ-73/#288已按固定配置REJECT完成并关闭（PR293）；VPJ-72/#287离线盲评/反馈工具已实现并修复两项独立审查问题，PR294已合并9fa196a，准确HEAD审阅与CI通过，合并后CLI契约3/3通过；#287已按离线范围验收关闭。VPJ-70 #267额外消费VPJ-72结果，仍等待真实VPJ-67。HF试验不重做PR277配对框架，不更换真实provider/预算路径，不因此关闭原运行票。

#194的持久预算实现已由PR284合并8a465f9：本地PostgreSQL9/9（含并发与worker崩溃）、完整本地Supabase25→26/Auth/PostgREST1/1通过；单元45/契约188/受影响专项11通过。准确HEAD7579cc6独立审阅Critical0/Important0，Quality34394008077与Budget PostgreSQL34394008088通过，后者在镜像仓库限流后重跑成功9/9、零skip；没有跳过检查。新SQL随后获授权并通过Staging25→26、40项HTTP/身份/合成预算检查；随后真实C0 provider与本地worker调用/费用保留已验证；部署worker与完整用户链仍未验收。见artifacts/VPJ-59/verification.md及Issue194的合并结果评论。

新增预算迁移与本轮合成用途授权已落实；当前继续真实provider协议/成本与运行接口验证。#194的Staging预算与本地真实C0 provider调用方已验，部署worker/用户链仍未验；#195仍缺持久coordinator、部署身份消费者与真实provider；本机身份metadata链已具备，不能混同C2聊天授权；#206的审核ledger/语料仍属内存或fixture，并依赖#195/#205及获许可知识输入。依赖仍为189+193→194，191+192+193+194→195，195+205→206→Harness67。后续先取得对应授权/策略/真实接口，再接通；不以新增同类fixture替代它们。

## 验证范围

本次整合：unit92/contract199/evals25/security99/E2E40及build/static22通过；真实身份/Trip两个opt-in均执行，integration31pass/0fail/10预算环境skip保持INCOMPLETE。浏览器与Swift双端证据不等于生产/完整产品验收。

历史基线CI34313179100浏览器9通过；integration10skip/security1skip按incomplete保留。VPJ-66仅按离线范围完成。已运行模式、语言、数量、成本unknown和未运行模式见artifacts/VPJ-66/results.json；实际费用与线上能力仍未验证。

## 2026-09-10 当前交付与远端边界

PR302保留iOS17同句SwiftUI/UILabel对照：production2FAIL、SwiftUI2FAIL、UIKit2PASS，原失败和截图限制不变。PR301修复Simulator测试签名与隔离/就绪流程后完整CI通过；不是以删除断言或过滤审计取得通过。详见artifacts/VPJ-05/ci-signing、ci-runtime及VPJ-01/ios17-cjk-reference。

Staging只读迁移列表已重新确认26，27/28仍未应用。公开Preview登录bundle指向该新加坡项目；管理接口403，服务端和Production配置仍待核实。DB28严格协议与legacy客户端存在切换间隙，应先盘点所有调用端并取得明确升级/配置/维护范围；回退flag不能恢复legacy兼容。远程原生仍缺受控配置契约，不能将loopback本机证明转写为远端就绪。硬锁和C2问题仍待产品决定，不取消原依赖。
