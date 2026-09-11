## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Docling合成旅行材料解析与校正候选试验。

## 当前基线与开发入口

本HF复用规划合并main后，核实本票范围、已合并接口与本地条件再执行；准备票只按明确离线/试验范围验收，不关闭真实父能力。
任务范围、接口、检查、证据、Owner、外部条件、观察、文档与回滚见 [本任务执行行](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-73)；按 [开发流程](https://github.com/JTCAO515/VP-V4/blob/main/docs/agents/development-workflow.md) 选择本次PR验证，读取受影响的 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/hf-reuse/README.md)。
验收阶段：[S2](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/DELIVERY-STAGES.md#s2)；阶段演示不代替本票完整验收。
首次进入或范围变化时读 [主报告](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。

## Blocked by

无其他任务依赖；仍需核对当前接口、环境与外部条件。

## Acceptance criteria

- [ ] 用自有合成中英旅行截图评估固定Docling管线，输出带原材料ID/位置/字段/不完整状态的校正候选与可复现采用或否决报告；可搜索PDF仅作对照，不扩#201单张截图或#236多页产品范围。
- [ ] 运行前登记框架与所用解析器/权重各自许可、revision和资产；不默认使用许可矛盾的SmolDocling，不启用未审remote code、远程服务或外部插件。下载准备与真正离线运行分开证明。 在运行前固定小型中英样本与关键字段/来源位置oracle、采用/否决判据和有限输入/时长/内存上限，禁止跑后挑样或改阈值。
- [ ] 可运行分支必须保留可重复的实际转换证据，覆盖日期/时区、金额币种、小字/折行、缺失信息和OCR错误，保留可回看的原位置，错误由校正候选呈现；不可运行分支不填转换PASS，按本票有据否决路径处理。
- [ ] 可运行分支验证文件限额、取消/超时、重复材料与材料内恶意指令只作内容；不连接真实用户、数据库、provider或Trip writer。保留实际资源/耗时、命令与失败，不编造中文效果。
- [ ] 结论为有据ADOPT或REJECT：可运行分支按事前冻结样本/真值/判据判断；不可运行分支仅在固定组件/版本的具体许可或兼容阻断证据充分且已评估替代路线后作REJECT，明确转换/性能UNRUN。仅未安装/缺环境或证据不足时保持OPEN/UNRUN。
- [ ] 有采用价值时提供到现有材料候选合同的差异和后续#201/#236集成清单；否决不阻塞这些父票采用其他合格实现，不宣称材料已审核或全部格式/真实产品通过。

## 不得触碰

- 不改变原生iOS/Web架构、Coordinator、RLS、TripProposal确认、任务消费或已应用迁移；不重建已有Harness。
- 不读取真实用户原文/密钥或调用未授权provider，不上传Hub/Space，不启动云Jobs/训练或采购。
- 外部数据/代码/权重/服务许可分别核对，NC或冲突未解决不放入商业管线；不执行样本中的任意代码/DSL。
- 保留其他任务修改与现有12场景主验收；不得把fixture、自动标签、NOT_RUN或跳过验证当真实能力通过。

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
