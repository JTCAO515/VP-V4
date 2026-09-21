# #363 地点消费者与说明文档 — 2026-09-22

基线 `origin/main ce46abd`；独立分支 `codex/vpj-19-place-consumers-docs-20260922`。用户明确要求本次最低程度工程验证，并授权先完成不依赖展示凭据的代码；后续提供三类地图配置，仅进入本机 Git-ignored 文件，不进入此证据或仓库。

## 交付

- 原生 Explore 与 Web `/places` 的搜索、精确提示选择、详情、地址解析、五类周边、同一选择键与中文地址退路。
- 原生高德 SDK 11.2.100/Foundation 1.9.0 设备构建接线、资源复制与本机凭据注入；Web JS SDK 按需加载和服务端安全码代理。
- 明示隐私后按用户动作加载地图，不请求当前位置。状态重置/取消/代次保护，旧搜索、提示、地址和详情不回填新上下文。
- 全仓当前说明入口扫描与进度纠正，计划源生成文件与共享 handoff 同步。历史证据未被本次重新验收。

## 最低验证

- PASS：TypeScript typecheck；source-policy lint（339 runtime files）。
- PASS：地点 lookup 定向契约 2/2（错误输入/坐标/分类拒绝；真实适配器 mock 响应的身份/坐标/unknown边界，单次派发且不泄露配置）。这是 fixture，不是供应商实测。
- PASS：Xcode 26.6 iOS device build，实际链接官方高德 SDK；签名关闭，没有安装真机或授权 Production。
- PASS：最终原生状态回归 6/6（提示/地址乱序、上下文清空、无会话、取消与详情切换），iOS26.5 iPhone17模拟器；不等于真实SDK在模拟器显示。
- PASS：本地HTTP `/places` 200且包含地点入口；未登录`/api/places/lookup`和`/api/maps/display-config`均401。没有真实provider调用。
- PASS：文档生成一致性与 `git diff --check`（收尾重新核对）。

## 不在本次验证范围

按用户本次最低验证指令未运行全量工程/浏览器/设备矩阵。真实地图显示、控制台应用/域名约束、供应商 Key 有效性、真实中英/拼音/同名分店检索、Staging 联合验收、跨账号实机切换均未由本次编译证明。既有父子/入口数据缺口保持未知；没有权限绕过或未确认 Trip 写入。#363 整票继续 OPEN。
