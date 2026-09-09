# Harness 实施状态

2026-09-10 代码基线核对至 main `d78e188`，运行证据更新至本次授权执行；不是最终产品验收。本次在明确追加授权后实际执行Staging预算迁移及验证，结果见artifacts/VPJ-59/staging-20260910.md。

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
- VPJ-01 #188：PR278合并f6928c8，准确HEAD审阅及Quality/Native CI通过；本地iOS26.5最终8单元+7UI通过，iOS17.5为8单元+3UI通过、4UI裁切审计失败。同设备基线对照复现中文banner及Tools既存失败，本次减少对比度问题；不能作为最低系统验收通过，最大字完整contrast诊断亦保留FAIL。真实VoiceOver/设备与所选Trip对象Ask sheet仍未验收。当前TripView为空Trip状态，没有真实已选对象消费者；不可新造演示对象冒充该结果。
- VPJ-04 #191：PR279合并798dc36，准确HEAD审阅/CI及合并后30项身份测试通过。SDK验证普通用户JWT并绑定同JWT客户端，Web cookie/Origin路径保留；没有权威mobile epoch时原生数据方法全部拒绝。真实iOS登录/刷新/退出、第二手机顶替及iOS→API→RLS仍未接通。
- VPJ-06 #193：PR275已合并 `0aeb0d2`，准确HEAD独立审阅与Quality CI34382279996通过，合并后协议/安全20项零skip通过。交付仅C0注入transport的三家协议适配；无真实provider调用、自动路由或工具执行，费用unknown。真实账号条款/地区、预算远端接入、共享消费者接口和中英质量/费用验证仍阻塞父票；本轮测试预算授权已收到，不再视为缺失。
- VPJ-62 #202无形式任务依赖，但实际邮箱/同意/回执/退出涉及真实接收方与数据政策，且不在Harness主依赖链；不为绕开阻塞自动开放收集。

新代码不绕开RLS、确认、provider/接收方或发布门。继续上述已有契约支持的有界准备与修复；准备不得替代真实接口、授权或集成验收。各开发线使用独立工作树，provider与pairing目录互不抢改，准确HEAD审阅和必需CI通过后串行合并。

## 下一阶段真实链边界

[HF执行增量](hf-reuse/README.md)新增VPJ-72判分/盲评准备和VPJ-73材料解析试验；本规划合并并核条件后可独立推进。VPJ-70 #267额外消费VPJ-72结果，仍等待真实VPJ-67。HF试验不重做PR277配对框架，不更换真实provider/预算路径，不因此关闭原运行票。

#194的持久预算实现已由PR284合并8a465f9：本地PostgreSQL9/9（含并发与worker崩溃）、完整本地Supabase25→26/Auth/PostgREST1/1通过；单元45/契约188/受影响专项11通过。准确HEAD7579cc6独立审阅Critical0/Important0，Quality34394008077与Budget PostgreSQL34394008088通过，后者在镜像仓库限流后重跑成功9/9、零skip；没有跳过检查。新SQL随后获授权并通过Staging25→26、40项HTTP/身份/合成预算检查；真实provider调用和部署worker接入仍未验收。见artifacts/VPJ-59/verification.md及Issue194的合并结果评论。

新增预算迁移与本轮合成用途授权已落实；当前继续真实provider协议/成本与运行接口验证。#194的Staging预算已验，真实provider调用方及部署worker仍未验；#195仍缺持久coordinator、权威原生会话与真实provider；#206的审核ledger/语料仍属内存或fixture，并依赖#195/#205及获许可知识输入。依赖仍为189+193→194，191+192+193+194→195，195+205→206→Harness67。后续先取得对应授权/策略/真实接口，再接通；不以新增同类fixture替代它们。

## 验证范围

CI34313179100浏览器9通过；integration10skip/security1skip按incomplete保留。VPJ-66仅按离线范围完成。已运行模式、语言、数量、成本unknown和未运行模式见artifacts/VPJ-66/results.json；实际费用与线上能力仍未验证。
