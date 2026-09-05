# VPJ 运营与客户交付手册

日期2026-09-05；所属Program #187。此文给后续操作者与coding agent共同使用，不含真实凭据。

## 1. 总时间盘

JT每周总35小时：真实客户任务10、研发验收8、招募社区6、内容合作4、知识审查3、客户支持2、复盘2。30小时周减少内容/合作/非关键研究；40小时周加已约用户/真机测试。不能把35小时营销再与40小时开发重复累计。

每周3–4次访谈/回访、1–2次材料/规划交付为起点；准备/笔记/排期计入。两周只验证自有/许可转介绍+一个社区+一个伙伴渠道，一个英文主题复用为平台内容和中文运营摘要。

## 2. 第一次交给客户的材料

用户能读懂的中英介绍；适合/不适合人群；iOS安装/邀请链接；当前覆盖；首个想法/材料/在途入口；AI与第三方资料说明；客服时段和紧急出口；Pass购买/恢复/到期/退款；数据导出删除；反馈和退出入口。

示范材料只使用虚构或获准去标识案例；Founder-assisted研究明确谁在实际工作。不复制客户完整订单进公开Issue或营销内容。

## 3. 外部操作登记字段

每项必须有：实际owner、prerequisite、需要操作的平台、非秘密配置项、预期结果、验证命令/截图、影响依赖、失败回滚和下一动作。密钥只在本地/服务端secret store，文档记录完成/未完成，不记录值。

| 操作 | 对应Issue | 准备/执行与可检查结果 |
| --- | --- | --- |
| Staging | VPJ-02 | 确认目标与无真实用户，核迁移manifest，再执行真实隔离验证；对象错误立即停 |
| 隐私与地区 | VPJ-03 | 填主体、期限、用途、AI接收方与case权限；法律/供应商不确定项由相应责任人核 |
| 模型/媒体 | VPJ-06/60 | 在批准账户/地域调用受控任务，记录质量/usage；不让agent从聊天拿key |
| 地图/酒店 | VPJ-18/22 | 核商用权利、价格、参数与缓存，真机落地；条件不支持则收窄CTA |
| 数字商品 | VPJ-33/34 | 配置限期non-renewing SKU，StoreKit2验证/恢复/退款，沙盒和生产分开 |
| 原生分发 | VPJ-56 | 当前工具链、BundleID、签名、Archive、上传、内部安装；42再验完整体验 |
| 备份/恢复 | VPJ-38 | 隔离环境恢复DB+对象+删除状态，实际RPO/RTO记录；不在生产破坏测试 |
| 境内网络 | VPJ-63/39 | 先登录AskTrip，再媒体/OTA/IAP/通知，真实普通网络实测 |
| Production | VPJ-43 | 独立环境与凭证、迁移、资产/权限/备份；不能把staging用户直接复制上线 |
| AppStore | VPJ-44 | 完整正式1.0、metadata/privacy/AI许可/删除/IAP、reviewer访问；拒审修复后再提 |
| 观察 | VPJ-45/47 | 技术运行观察与用户自然旅程机会分开，未发生机会不记流失 |

## 4. 事件与经营分母

qualified_prospect→research_opt_in→started_trip→first_value→activated_trip→eligible_next_moment→organic/triggered/founder_prompted_return→real_price_opportunity→net_paid。outcome_declined是有用反馈但不是激活。中文版译文评测不是中文消费者需求样本。测试买单、赠送和退款不算净付费。

主报告B0–B4是唯一门槛；不得同时使用旧10人/第2周抱怨、0/15立刻kill、注册即激活等历史标准。

## 5. 支持容量

人工request→queued→accepted→assigned→in_progress/waiting_external→resolved/unresolved/closed。只有接受后才能承诺下次更新时间。未接受请求给自助/正规渠道；不写全天候或保证解决。

保留research_minutes、first_result_service_minutes、weekly_trip_service_minutes三列。容量=floor(weekly_support_minutes/P90weekly_trip_service_minutes)；没数据时最多5个同时Active Trip试点，再按真实2小时支持预算调整。

## 6. Runbook最小集合

provider超时/usage丢失；worker崩溃/lease/poison queue；Trip确认结果未知；无网回放/缓存过期；来源/许可撤销；错误翻译/高风险建议；StoreKit pending/重复/退款/到期；账号顶替/遗失设备；数据泄漏与删除失败；Ops越权/员工撤职；内容举报/误审；数据库/Storage恢复；撤回版本/商店下架与用户通知。

每份runbook指定检测信号、值守owner、第一动作、禁止动作、验证、升级时机、用户表达和复盘。没有值守能力就降低服务承诺，不依靠创始人长期超时工作。

## 7. 发布门

本地/CI通过只证明相应代码；真实Staging所有必需检查无skip；TestFlight真实用户路径；独立Production；完整AppStore1.0；72小时运行；至少7天机会相关跟踪。经营PMF不是技术release关闭的虚构前提，另由47给证据判断；Program跟踪两个不同终态。

## 8. 现金与容量

12周损失预算由JT在33/46登记。80%冻结新增承诺，100%停止新增支出；未填不允许agent采购，允许已有授权范围内研究/本地准备。Pass成本在15%和30%平台费情景下都复算，税费、退款和人工另列。

## 9. 操作者实际开始的步骤

Staging：登录现有Supabase Dashboard，在Project Settings核对项目身份和环境标签；由VPJ-02按迁移manifest执行受控验证。记录项目用途、migration head、三类身份结果和错误，连接值只存secret配置。目标环境不符时停止，回到项目列表核对，不自动另建或清空。

Apple分发：在Developer/App Store Connect确认Account Holder权限、App ID/BundleID、团队、签名和App记录；VPJ-56用本地Xcode完成Archive与Validate/Upload，安装内部TestFlight构建。看到构建可安装才完成这一步，AppStore正式审核仍是44；上传失败先看签名、SDK版本和BundleID是否一致。

商品：在App Store Connect对应App下配置Non-Renewing Subscription，确认30天规则、中英说明、参考价对应地区商品和税务/收款协议；VPJ-34只先用sandbox核交易、恢复和到期。不要把non-consumable选成永久权益，不向访谈用户索取私人转账；正式生效/退款以verified transaction账本核对。

地图/酒店：联系官方开放平台或联盟账户支持，写明‘海外行前+中国境内在途+原生App/Web+语言+数据字段+缓存/展示/模型用途’；保存获准范围和有效期。真机验证落地参数后，agent才能配置对应白名单模板；合同没有的字段不从网页补抓。

地区与资质：VPJ-03/44按经营主体、用户所在地区、数据路径和商店分发地区核个人信息/跨境处理、APP备案、生成式AI服务、UGC和旅游信息/代理责任的具体适用性。记录‘适用/不适用/待核’及来源/责任人，不能因使用中国LLM或只外跳就推定全部豁免。参考[网信办生成式AI暂行办法](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm)、[工信部门APP备案工作说明](https://fjca.miit.gov.cn/zwgk/tzgg/art/2023/art_a0a63f500cb1430bb61279fc462c948e.html)。这项是实际法域确认工作，不是本研究已经给出的法律结论。

所有操作结束后在自己的Issue附脱敏结果、失败/回滚、下一个可执行动作；其他agent由执行合同接手，不依赖聊天中口头‘我配好了’。
