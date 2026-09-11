## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Harness：核心任务发布判定与能力停用恢复验收。

## 当前基线与开发入口

原VPJ基线已合并；2026-09-10品牌增量以Q1-Q38报告的已确认方向为准，当前任务及新增规划契约需按合入main后的版本执行。已有可独立进行的准备范围继续；开发接入与可逆参数由agent按现有方向推进，无需第三方、法务或产品许可；真实收费与发布按相应范围验收。 开发阶段不等待供应商工单/书面答复、法务或产品许可；按开发接入规则用现有账号/API推进，未知项记录，保留用户同意和实际技术验证。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-71)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/README.md)。
验收阶段：[S5](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s5)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

- [VPJ-69 #266](https://github.com/JTCAO515/VP-V4/issues/266)
- [VPJ-70 #267](https://github.com/JTCAO515/VP-V4/issues/267)
- [VPJ-37 #229](https://github.com/JTCAO515/VP-V4/issues/229)
- [VPJ-63 #231](https://github.com/JTCAO515/VP-V4/issues/231)

## Acceptance criteria

- [ ] 使用同一选定commit/config与预冻结grader/阈值整合两条任务；选定配置可为达到门槛的原基线，仅对拟采纳候选复用VPJ-70入口扩充Trip配对。候选被拒可保留基线，不强制新增候选；完整回归与停用责任仍必需。
- [ ] 完整12场景按required mode实际运行，必测集无FAIL/NOT_RUN；中英/风险/正常可答分别达门槛，未运行不删除分母、全拒答不算成功，命名集硬违规0但不外推绝对可靠。
- [ ] 真实原生Ask/Trip、精简Web同Trip、持久worker、证据资格、步行量、准确确认/回执与预算/恢复证据可串联；fixture和录制回放不能替代规定真实模式。
- [ ] 接入已有Ops/flag及发布报告，复用VPJ-63同版本或等价受影响路径的真实境内外网络证据；路径变化需重验，不用本机/VPN假装用户网络。
- [ ] 在获准Staging演练按能力停用、恢复与部署回退，用户有可用替代，已确认Trip和删除/撤权状态不丢失；不改已应用迁移、不恢复撤销材料。
- [ ] 先验证故意失败或缺证据能阻塞判定，再提交实际结果；基线/候选变化重跑受影响集合，不拼接不同配置的通过报告。
- [ ] Harness门纳入现有发布验收资料；本票不授权生产、不自动关闭VPJ-41/42/43/45，不替代真实账号、原生设备、IAP、隐私或商店验收。
- [ ] 同一已选配置的两条真实中英任务同时验证ServiceTask必要澄清不重复消费、正确偏好使用及真实状态表达；保留12场景required mode与全部原门，表达更好不替代真实正确性/恢复/费用证据。
- [ ] HF复用：最终报告同时核验真实任务结果和内容/语气，不以讨喜均分抵消状态、事实、记忆、确认硬失败；确认公开基准、开发集和独立验收集的暴露记录，采用资源版本/许可/运行环境可追。

## 不得触碰

- 不新建 Program、Coordinator、模型路由、长期记忆、预算账本或 Ops 仪表盘；缺失基础接口归原 VPJ 责任票。
- 保留 actor/RLS、证据资格、用途/接收方许可、准确版本确认和原子 TripPatch；不解除 Trip/proposal 工具注册限制。
- 不读取或持久记录秘密、真实用户原文或完整思维链；不修改原用户工作树、既有65项范围/依赖或已应用迁移。
- 不把 fixture/NOT_RUN/skip 当真实通过，不自动上线候选，不进行未授权的账号、外发、采购、支付或生产操作。

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
