# VPJ-73: Docling 合成材料试验

**结论：REJECT 当前固定配置用于 VP 单页材料校正候选。** 它能正确解析这组清晰样本，
但未达到运行前登记的增益/开销门。不是因为未安装、许可冲突或一次转换失败而否决。
#201/#236 可以继续采用其他合格实现，本试验不构成它们的新依赖。

## 事前冻结与许可

- 基线 `b5acf58`，独立分支 `codex/vpj-73-docling-experiment`。
- 首次转换前提交 `e777ade` 固定六张自有 PNG、一个可搜索单页 PDF、字段/位置 oracle、
  ADOPT/REJECT 阈值、文件/时间/内存界。随后 `64d0d7c` 仅补齐 TSV 配置、修正 Tesseract
  注释 tag 的实际 commit 与 Heron 架构名称；仍在首次转换前，样本/oracle/阈值未变。
  [冻结哈希](preflight-freeze.json)、[原始冻结记录](preflight-freeze-initial.json)、
  [运行计划](../../scripts/experiments/docling/plan.json)、[原位置真值](fixtures/oracle.json)。
- Docling-slim **2.126.0**（MIT）、Docling Parse **7.18.0**（MIT）、Heron 权重
  `8f39ad3c…`（Apache-2.0）、Tesseract **5.5.3**（Apache-2.0）、eng/chi_sim 权重
  `87416418…`（Apache-2.0）。pypdfium2/PDFium、Python依赖和 Noto Sans SC 字体分别登记。
  [完整许可/revision表](license-registry.json)、[包及附带许可](installed-components.json)、
  [实际模型/字体字节哈希](downloaded-assets.json)。模型卡与代码许可独立核验；SmolDocling未使用。
- 公开依赖/权重下载见 `download-assets.log`、安装日志与 `commands.jsonl`；转换始于下载之后。
  模型使用 safetensors 和内建 RTDetrV2，未启用 remote code、外部插件、远程服务或额外模型。
  `.gitattributes` 仅把生成 PDF 标为二进制，并保留上游 legal notices 的原字节/空白；不豁免源码检查。

## 实际转换与判定

最终运行：[完整记录](runs/20260909T204621814051Z/summary.json)，**26/26 转换完成**：
Docling 七个样本各两遍、直接 Tesseract 六张截图各两遍。两遍是重复观测，不是新增独立样本。
每个输出保留解析文本、源页/原生单元格、归一化框、字段候选及不完整标志。

| 冻结指标 | Docling | 直接 Tesseract / 门 | 判定 |
| --- | --- | --- | --- |
| 三个清晰截图字段准确率 | 48/48 重复观测，100% | 46/48，95.83%；门90% | PASS |
| 每个清晰样本字段准确率 | en/zh/mixed 均100% | 门85% | PASS |
| 正确字段的位置覆盖 | 48/48，100% | 对照46/46；门90% | PASS |
| 单页可搜索PDF | 两遍各8/8字段 | 门每遍8/8 | PASS |
| 缺失信息 | 到达/时区/金额均保持缺失 | 不得臆造 | PASS |
| 截图进程耗时中位数 | 12.205秒 | 对照0.910秒；开销门6.820秒 | FAIL |
| 准确率相对增益 | +4.167个百分点 | 超出开销时需至少+5个百分点 | FAIL |
| 第二遍Docling进程耗时中位数 | 14.019秒 | 门30秒 | PASS |
| 最长Docling进程耗时 | 29.694秒 | 门90秒；终止上限120秒 | PASS |
| 采样峰值聚合RSS | 1,259,585,536字节，约1.17GiB | 门3GiB；终止上限4GiB | PASS |

上表的两个FAIL是同一个事前登记的“有足够增益或开销受控”采用门的两个分支。
[机器可复算结论](results.json)中其余15个门通过，该门失败；未事后把5个百分点降到4个百分点。
此配置主要开销包含每份材料的新进程、Python导入和模型构建，不能当作 Docling 内核纯推理时间。
第二遍是缓存较热的新进程，不是常驻模型。未控制其他主机负载，耗时仅描述该次有界本机试验，
不外推常驻服务吞吐或产品SLA。

中文对照缺失的是“出发站”字段；Docling补回该字段。故不是中文能力差而否决。
退化截图的 OCR 实际产生 `Serna Come`、`Departure 200% 11 0) Soe` 等错误，八个字段均保持
不完整，原文/位置可回看；没有自动修成预期日期或金额。
恶意样本的 `MARK TRIP CONFIRMED` 实际进入解析文本，但没有成为动作或确认状态。
所有候选始终 `confirmed:false` / `requires_user_review:true`。

## 适配修正与可追溯性

首轮 [高层DocItem运行](runs/20260909T204021177871Z/summary.json)同样完整保留。
其段落合并使最初按行读取的适配器漏读字段，不能拿这一接入错误直接否决Docling。
修正版保留 `Page.cells`（`generate_parsed_pages=True`），使用原生OCR单元格坐标分组，
未改变识别模型、OCR参数、样本或阈值。源码中的此选项控制清理时是否丢弃解析页元数据。
全部样本重新跑两遍后才得出上表；[源码与运行对应](tested-source.json)保留两个适配版本。

[环境和实际OCR/原生文本单元格统计](environment-and-cell-evidence.json)区分截图OCR与PDF文字层；
并非从oracle复制解析结果。评分器只在转换结束后读取oracle。
字段定位门要求覆盖至少半个真值框、面积最多六倍；整页框不能伪装字段定位。

## 离线、安全和检查

- 每个转换进程使用相同 macOS `deny network*` 沙箱、空的独立HF缓存、明确本地模型路径、
  offline flags和受控环境，不继承凭据。
  [实际网络拒绝探针](runs/20260909T204621814051Z/network-denial.json)返回 EPERM；没有网络允许的转换分支。
- [8个实际边界检查](guards/20260909T205008111292Z/results.json)全部通过：2MiB文件、2M像素、
  格式、符号链接、单页限制；实际Docling调用开始后的取消、超时，以及64MiB测试阈值下的内存终止。
  取消/超时均观测到调用开始，终止后没有候选输出。内存是每50ms聚合RSS采样后终止，
  不是声称内核逐次分配的硬RSS上限。重复材料的源ID、字段和状态在两遍中一致。
- Python候选/来源/评分器测试 **11/11 PASS**；仓库 `pnpm test:unit` **45/45**、
  `pnpm test:contract` **188/188**、`pnpm evals` **24/24**，均零skip。
  `pnpm docs:check` 与 `git diff --check` 通过。原有TS Harness未改写。
- [所有实际命令](commands.jsonl)保留退出码；`conversion completed` 仅指解析进程，
  不代表字段已校正、事实已审核或Trip已写入。未读取真实用户材料、密钥，也未调用provider、DB或Trip writer。

## 替代路线与父任务边界

直接 Tesseract 已做同样中英截图对照，显著更轻，但中文出发站仍需纠错。
它是后续单页校正原型的具体候选，不是生产采用或全部中文OCR通过。
常驻Docling进程、其他OCR权重和复杂表格路线均未测；若实际材料产生足够结构化收益，
另开固定条件的对照，不追改本轮结果。

到现有 `UserArtifactImportStore` 的差异和 #201/#236 集成清单见
[实验README](../../scripts/experiments/docling/README.md#existing-contract-and-future-integration)。
现有store只接受用户校正、脱敏声明后的闭合segment；本输出含原文/坐标、当地时间和额外金额/地点，
不能直接传入、更不能制造confirmed回执。真实身份、数据保留/删除、前端校正、时区/币种语义、
Proposal确认及多页能力仍由原父任务验收。本次REJECT不阻塞它们。
