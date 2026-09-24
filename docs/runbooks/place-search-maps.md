# 地点搜索、详情与高德展示

范围：VPJ-19 子票 #363。Web `/places`（`/explore` 提供入口）与原生 Explore 使用现有身份及供应商适配器。中英输入、搜索/提示/详情/地址解析/周边五类入口已接入；地理信息是供应商观测，不自动成为知识 Fact、已确认 Trip 或已核实入口。

## 选择与退路

- 选择键优先使用已存在映射的 `canonical:<uuid>`，否则使用 `provider:<provider>:<poiId>`。提示有 ID 时保留精确对象；无 ID 的文本提示需要再搜索消歧。不按名称或向量自动合并。
- 地图与详情共用选择键，只绘制已取得的 GCJ02 点位；不把建筑中心推断成入口，不对已是 GCJ02 的坐标重复转换。名称、中文地址和查询时间来自本次响应；无法证明的父子/入口关系、英文别名来源、营业/无障碍和特殊服务显示未知，不编造。
- 搜索词、城市、供应商、账号及页面/前后台变化清空旧状态；请求代次与取消信号防止迟到回填。Web 页面隐藏/退出清空内存，原生还有会话 epoch 隔离；没有新建跨账号缓存或位置历史。
- 地图由用户阅读高德用途与隐私链接后主动加载；不请求设备当前位置。用户可手动选城市、地址和具体结果。SDK失败或没有凭据时继续读取、复制/分享地址。
- 周边以选中点为中心，固定 1 公里，提供厕所/便利店/餐饮/药店/ATM。一次查询只调用用户所选服务商；不默默双调用或跨供应商降级。
- 保存/重载 Trip 继续走既有 owner 与 Proposal/确认合同；本页不会为了“保存地点”直接写入 Trip。Save/Ask/Add 的持久消费仍归 #365/#210；路线比较和导航交接归 #364。

## 配置

本机私有配置 `.env.maps.local` 与 `.env.maps.ios.xcconfig` 均被 Git 忽略，权限应为 `0600`。仓库只提交空模板。**不得把三种 Key 混用**：

| 字段 | 使用位置 |
| --- | --- |
| `AMAP_WEB_SERVICE_KEY` | 服务端搜索/详情/地址/周边适配器，绝不返回客户端 |
| `AMAP_JS_DISPLAY_KEY` | Web JS 展示；登录后只返回公开展示 Key，须在高德控制台限制实际域名 |
| `AMAP_JS_SECURITY_CODE` | 仅服务端固定路径代理使用；不是 `NEXT_PUBLIC_*` 字段 |
| `AMAP_IOS_DISPLAY_KEY` | 原生 iOS 展示；通过本机 xcconfig 注入 `VisePandaAMapIOSKey`，须匹配 `space.go2china.VisePanda` 的实际应用绑定 |

控制台应用/域名绑定及 Key 实际有效性没有由填写配置自动验证。服务端启用项：`AMAP_SEARCH_ENABLED`、`AMAP_SUGGEST_ENABLED`、`AMAP_DETAIL_ENABLED`、`AMAP_GEOCODE_ENABLED`、`AMAP_REVERSE_GEOCODE_ENABLED`、`AMAP_NEARBY_ENABLED`。默认缺失时不调用供应商。腾讯仍使用既有独立开关和安全配置，不复用高德 Key。

开发服务器显式加载本机配置（不改变远端环境）：

```bash
node scripts/maps/with-local-env.mjs pnpm dev
```

正常登录仍需已有 Supabase/Native 身份环境；没有真实会话时，地点和地图配置接口返回 401。不得通过临时假登录或给地图代理开放匿名权限来测试。

## iOS SDK

```bash
node scripts/maps/install-ios-sdk.mjs
```

脚本下载并校验固定官方包：AMap 3DMap 11.2.100、Foundation 1.9.0；二进制位于被忽略的 `ios/VisePanda/.local/amap/`，不上传仓库。`Maps.xcconfig` 在设备构建中链接这套 SDK，构建阶段复制 `AMap.bundle`。模拟器保留无 SDK 的地址退路，不能用该退路通过声称高德地图已在模拟器渲染。修改版本必须同时核对发行包、头文件和 SHA-256。

私有 xcconfig 使用一行 `AMAP_IOS_DISPLAY_KEY = <本机配置值>`。基础配置可选包含该文件，缺失时界面显示地图不可用。Key 包含在客户端应用中是展示 SDK 的机制，保护依赖控制台应用限制；它不能作为服务端秘密或权限证明。

## 接口与边界

`GET /api/places/lookup` 与 `GET /api/places/native/v1/lookup` 支持封闭的 `search/suggest/detail/geocode/reverse/nearby` 操作，分别复用 Web Cookie 与原生会话验证。输入有限长；坐标须显式 GCJ02；服务端上游固定、调用有超时，无持久写入。响应使用 `private, no-store`。

Web JS 2.0 仅在线加载高德官方脚本，`/api/maps/display-config` 只返回展示所需配置。`/api/maps/_AMapService/` 代理只接受固定 `v4/map/styles`、`v3/vectormap`、`v3/log/init` 路径，覆盖请求中的 Key/jscode；不转发上游 Cookie 或诊断头。原生使用原生 SDK，Web 使用 JS SDK，两端均只加载高德，未接第二家展示 SDK。

[高德 JS 加载文档](https://lbs.amap.com/api/javascript-api-v2/guide/abc/load) · [JS 安全代理文档](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode) · [官方 3DMap 发行规格](https://github.com/CocoaPods/Specs/blob/master/Specs/5/f/c/AMap3DMap/11.2.100/AMap3DMap.podspec.json) · [Foundation 发行规格](https://github.com/CocoaPods/Specs/blob/master/Specs/8/f/f/AMapFoundation/1.9.0/AMapFoundation.podspec.json)。本次原生 API 编译以实际下载的官方头文件为准。

## 按用户配额与安全头

- 付费供应商路由（Web `search/nearby/lookup`、原生 `native/v1/*`、`/api/maps/_AMapService/*`）在认证之后、调用供应商之前执行按用户配额：`lib/server/maps/place-quota.ts` 集中定义阈值（`places` 每分钟 30 / 每 UTC 日 500；`map_proxy` 每分钟 300 / 每 UTC 日 5000），数据库 `public.consume_place_quota_v1` 原子计数（迁移 `20260923140000_places_provider_quota.sql`，SECURITY DEFINER、空 `search_path`、仅 `authenticated` 可执行，按 `auth.uid()` 选行）。超限返回 `429 RATE_LIMITED` 与 `Retry-After`；被拒请求不计数；无法检查配额时 fail-closed 返回 503 且不调用供应商。计数表只存用户、桶和窗口计数，不存查询文本/坐标/IP，账号删除级联清除。`display-config` 不调用供应商，不计数。
- 部署顺序：必须先在目标库应用该迁移再部署代码，否则地点接口全部 503。
- 安全头由 `lib/security/headers.ts` 经 `next.config.ts` 下发：全站 CSP 仅同源加 `NEXT_PUBLIC_SUPABASE_URL` 的源（浏览器密码登录客户端直连 Supabase Auth，`connect-src` 需要；该值在构建时写入头部）（`script-src`/`style-src` 保留 `'unsafe-inline'`，因 App Router 内联 RSC 脚本与 React style 属性），`frame-ancestors 'none'`、`object-src 'none'`、`X-Frame-Options: DENY`、`nosniff`、`Referrer-Policy`、`Permissions-Policy`、COOP。仅 `/places` 追加高德/AutoNavi 源、`blob:` worker 与 `'unsafe-eval'`，并附不含 `'unsafe-eval'` 的 Report-Only 候选策略；真实 Key 实测无 Report-Only 违规后可移除 `'unsafe-eval'`。

## 验证与回退

本次按用户要求只做最低工程验证：相关编译/类型/源码检查、定向回归与本地未登录 HTTP 检查，见[执行记录](../../artifacts/VPJ-19/363-consumers-20260922/verification.md)。未重新运行付费供应商、未部署 Staging/Production、未完成真机地图/域名绑定/网络矩阵与整票验收，#363 保持开放。

撤回本分支可恢复原客户端；也可移除对应本机配置或关闭 provider 开关。保留原 Trip、身份、映射和历史记录；没有新增或重写数据库迁移。
