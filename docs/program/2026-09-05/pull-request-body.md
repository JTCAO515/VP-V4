# VisePanda VPJ 全项目基线

将分散的产品研究、Web文本beta队列与本地iOS预览统一为一份可执行的完整交付规划：中英原生iOS、同Trip精简Web、Journey Agent、知识与RAG、现场翻译/讲解/恢复、运营、官方IAP、客户获取和发布维护。

Relates to #187。此PR不关闭产品Program；65个子Issue仍须按依赖完成各自运行验收。

## 主要变更

- 完整主报告、接口、运营发布、65项纵切及198条依赖，带文件边界、命令、验收、owner、工时/观察与回滚。
- 旧20个开放Issue的完整快照/责任映射和可恢复迁移；实际迁移结果见Program JSON。
- 当前中英与原生优先、酒店L1a/L1b、Free+30天Journey Pass试验进入ADR-0023；未批准的实际数据/供应商/账户条件留给operator任务。
- 归档无运行时消费者的旧Landing；资产/lint检查改为实际Homepage组件；保留所有SQL/安全测试和用户本地工作。
- 旧文档退出当前执行入口；生成INDEX/manifest/CONTEXT/HANDOFF；修正direct queue依赖冲突与重复ADR编号。

## 验证

pnpm check通过（lint/typecheck/build/22静态测试）；unit29、contract161、source-e2e40、eval20通过。
integration19通过/9显式skip；security80通过/1显式skip：真实本地Supabase/RLS缺失，标incomplete，未冒充运行验收。
docs/DAG/归档hash、flags/assets preview通过；1280×800与390×844页面冒烟无水平溢出，console无error/warn。

发现现有跨页面语言回到中文的问题，已记录由VPJ-01/41承接。9项blocked-release素材仍保留发布门。

## 运行边界与回滚

未实现新App功能、未调用真实模型/客户/数据库/商店、未执行Production操作。基线合并前新任务保持blocked。
PR185/186保留；本PR继承部分治理修复且记录历史产品冲突，合并前后需按实际diff审查重叠。
恢复旧源码/规则可revert或从hash归档恢复；旧Issue可reopen并恢复快照标签。迁移历史和用户数据不回滚。
