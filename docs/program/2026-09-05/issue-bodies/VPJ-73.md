## Program

[VPJ-00 #187](https://github.com/JTCAO515/VP-V4/issues/187) · 首发交付任务

## 用户结果

Docling合成旅行材料解析与校正候选试验。

用自有合成中英旅行截图评估固定Docling管线，输出带原材料ID/位置/字段/不完整状态的校正候选与可复现采用或否决报告；可搜索PDF仅作对照，不扩#201单张截图或#236多页产品范围。

## 当前基线与开发入口

本HF复用规划合并main后，核实本票范围、已合并接口与本地条件再执行；准备票只按明确离线/试验范围验收，不关闭真实父能力。
主报告：[完整统筹方案](https://github.com/JTCAO515/VP-V4/blob/main/docs/VISEPANDA-MASTER-PLAN-2026-09-05.md)。
必须阅读：[本任务执行合同](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/EXECUTION-CONTRACT.md#vpj-73) 与 [领域接口](https://github.com/JTCAO515/VP-V4/blob/main/docs/harness/hf-reuse/README.md)。

## Blocked by

无其他任务依赖；仍需基线PR已合并。

## Scope 与接口

- `scripts/experiments/docling/**`
- `tests/**/docling/**`
- `docs/harness/hf-reuse/**`
- `artifacts/VPJ-73/**`

只修改本用户故事需要的路径。接口在消费者接入前版本化，不能仅交fixture声称完成。

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

## 验证与证据

- `pnpm docs:check`
- `git diff --check`
- `pnpm test:unit`
- `pnpm test:contract`
- `pnpm evals`



- `artifacts/VPJ-73/verification.md`
- `artifacts/VPJ-73/unrun.md`
- `artifacts/VPJ-73/commands.jsonl`
- `artifacts/VPJ-73/results.json`

真实DB/provider/设备/购买是验收条件时，skip或fixture只算部分完成。

## Owner / 外部条件 / 观察

Owner: coding-agent。类型: vertical。预估专注工作3日，外部等待另计；超5日必须再拆。

- 明确本票是独立本地试验，不依赖真实材料/provider/账号；只采用可核验许可的输入和组件。
- 实际转换命令由本票实现并记录在commands.jsonl，不预填尚不存在的Docling脚本命令；必要Python依赖与资源在隔离环境核对。

观察：有界准备PR；真实调用/人工校准/产品集成在原父票验证

## 文档与回滚

- `docs/harness/hf-reuse/README.md`
- `docs/handoff.json`

移除隔离试验入口与本票自有临时样本，保留采用/否决依据；不改既有材料入口、用户数据或迁移。

替代历史责任：见Program的旧新映射；不因新增任务删除有效旧测试。
