# 上海机场交通候选增量 — VPJ-15

S2 / Related to #205。新增一条可提交的原创中英候选 `SH-AIR-01`：虹桥机场 T2 与地铁2/10号线衔接，帮助旅客选择机场轨道交通。只适用于上海虹桥 T2，不是旧 `SH01` 浦东市域机场线条目。当前结果为**本地候选准备**，不计为已审核、已发布或产品可用覆盖。

- [statements.json](statements.json)：现有 `knowledge-statement/1` 的语言中立 assertion、中英正文/条件/限制，以及独立来源版本、时效、用途判断与待审核记录。
- [source-research.md](source-research.md)：官方来源、准确段落、日期、转载限制、读取失败及剩余未知项。
- [原 Supported Journey Matrix](../2026-09-12-first-party/supported-journey-matrix.json)：通过 `candidateSupplements` 登记本增量，原机场交通缺口继续保留；原13条批次和历史发布记录不变。

可读政府页发表于2024-03-21，本次实际读取于2026-09-22。日期不冒充最新运营公告；更新政府指南直接读取失败，机场 Metro 页返回521。当前机场主页仅作交叉核对，机场网站的服务信息转载限制保留，不作为可复用素材。政府页也未确立开放许可；原创摘要不是来源授权。未保存原文整页、图片、地图或交通表格。

## 本地准备提交

仓库根目录使用 Node 22+：

```sh
node --experimental-strip-types scripts/knowledge-prepare-candidate.mjs \
  docs/knowledge-base/batches/2026-09-22-airport-transport/statements.json \
  SH-AIR-01 /tmp/vpj15-sh-air-01-submit.json
```

工具对指定唯一编号使用实际 `isKnowledgeOperation` 校验，完整保留 assertion、双语条件、限制和来源，生成普通 `submit_statement` 请求文件。文件用独占创建写入；已存在则拒绝覆盖。若提交结果未知，复用原文件及 operationId/candidateId，通过既有幂等接口核对；不要重新导出另一组编号当作重试。编辑后的内容应先确认旧提交结果再走新候选流程。工具不访问网络，不读取凭据，不输出审核、发布或永久资格。

在已获准的 Staging 窗口，授权作者通过现有 `/api/ops/review` 提交此请求（正常 Cookie、Origin 和 `X-Ops-Expected-Actor` 校验），再由真实另一名审核者通过现有 Ops 页面独立审核。`lifecycle`、`freshness` 和 `qualification` 属于可审编辑记录，不作为权限字段送入API；提交时来源片段与版本按现有服务端逻辑登记。

## 下一验收动作与边界

1. 复核可读的当前官方线路信息及本次原创摘要的具体用途；审查中英等价、T2边界及全部排除项。`reviewer` 为空，研究子任务和本地测试都不是 Ops 独立审核。
2. 登记具体 Staging 窗口、作者和另一名审核者、目标部署及回退；没有本轮写入授权时不启停角色/开关或提交数据。
3. 正常提交→独立审核→另行发布（明确 useBasis/useNote 和 expiresAt），保存实际回执。没有审核或用途资格时不能发布。
4. 通过既有 Web/native 读接口核对上海 `airport_transport` 中英同 assertion、完整条件/来源；确认其他城市和场景不包含该候选。
5. 撤回准确 candidateId 后刷新，确认新读排除该内容；清理只恢复本窗口已获准改变的配置，不删除审计或恢复撤回内容。

上述真实环境动作均 **UNRUN**：本轮尚无指定 Staging 写窗口及真实独立审核。不存在新的发布凭证或运行 expiry。请求资格由现有读者每次按身份、scope、当前发布状态与时效计算。未启用 Ask、新场景推断或四城现场覆盖；不恢复 #206 冻结回归，不触碰 #359/#360/#479，不关 #205。

回退：撤销本内容/本地工具PR即可；本轮没有数据库或远端内容变更。
