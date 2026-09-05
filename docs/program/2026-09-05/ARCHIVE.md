# 归档与有效资产保留

Program #187。归档含义是退出当前生产/执行入口；历史证据与恢复路径保留。

## 实际归档

- `components/VisePandaLanding.tsx` 无运行时import；原文移动到 `docs/archive/2026-09-05/VisePandaLanding.tsx.reference`，hash不变。lint和资产扫描改为实际路由使用的两个Homepage组件，测试继续验证来源约束。
- 原CONTEXT/HANDOFF/handoff.json和旧tracker/执行规则完整复制至 `docs/archive/2026-09-05/baseline/`，新的根入口聚焦VPJ。
- 9月3/4日四份产品报告与概念图保留在 `docs/archive/2026-09-05/prior-research/`。原文件不改；旧附件链接可能指失效临时位置，历史正文非本版本链接承诺。
- 用户主工作区25个iOS源文件保存为 `ios-source-reference/VisePanda`，作为迁移输入；原工作区未修改，预览源码不计main原生能力。
- 九份旧主规划/分期文档原地加历史入口标记；具体来源、合同、已有迁移继续可读。
- 重复的thin HTTP ADR-0019按原PR185建议重编号ADR-0022，Trip snapshot原ADR-0019保留；无语义改写。

## 不归档/不删除

24条SQL迁移、Trip/Patch/RLS/负例/恢复测试、fixture oracle、仍有消费者的卡片、当前路由、原始品牌资产、用户未跟踪的Marketing和iOS工作。不把placeholder等同垃圾；不接受任意fixture进入生产composition root。

## 恢复

归档保留历史原始字节，包括Markdown双空格换行/末尾空行；`.gitattributes`仅对该只读归档关闭空白重写告警。`archive-manifest.json`逐文件SHA-256继续强制检查，当前代码/新文档不豁免空白检查。

先查看 `archive-manifest.json` 的原路径/归档路径/sha256；恢复旧Landing时同时恢复对应lint/资产检查路径。历史规则恢复需配合reopen旧Issue，不可只恢复一段相互矛盾的调度文字。无需生产数据回滚。
