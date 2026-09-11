<!-- Historical Issue #187 body before the 2026-09-11 stage reorganization. Not current execution authority. -->

# VPJ-00：VisePanda 全项目统筹与交付 Program

用户已于 2026-09-05 授权重新设计整体产品、定价/订阅、代码与文档处置，并将原有全部开放 Issue 关闭后建立新队列。

## 目标
交付中英双语原生 iOS 的一站式陪伴 Journey Agent。规划、准备、现场翻译/讲解、用户报告变化后的恢复共享同一 Trip；Web 为可基本编辑/确认的精简 Planning Studio。酒店首发止于需求/候选解释与经验证的联盟跳转。

## 初始统筹交付（2026-09-05历史）
- 完整主报告、领域合同与 UIUX/视觉/动效规格、运行与客户交付方案。
- 当前代码复用/迁移/归档台账；保留迁移和安全证据。
- 每个新 Issue 的范围、依赖、验收、可运行命令、回滚、owner 和交接。
- 原 20 个开放 Issue 的快照及新旧责任映射，关闭原因为 superseded/not planned，而非验收通过。
- 未合并 PR #185/#186 保留审查，冲突与可采纳内容在报告中登记。

## 实施入口
当前执行入口：[main / Program README](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/README.md)，完整任务与依赖见[当前任务表](https://github.com/JTCAO515/VP-V4/blob/main/docs/program/2026-09-05/ISSUES.md)。
PR #253记录初始规划基线；实际调度核对当前main、原生依赖、可用接口和获准环境，不从历史基线文案推断仍未合并或已就绪。

## 完成定义
本 Program 的统筹文档交付与后续产品交付分别计量；本 Issue 只有在新路线的发布/用户观察门全部完成后才关闭。
不把研究、fixture、代码合并、TestFlight sandbox 支付或来源目录数量视为真实产品验收。

## 初始授权记录与当前边界
2026-09-05的授权用于该次旧内容归档和旧Issue替代；这段历史记录不授权重跑新的全量队列迁移。已有同对象、环境、范围的有效授权继续适用，新增生产、数据、资金或供应商动作仍需对应明确授权。


## 初始队列（2026-09-05快照）

- [VPJ-01 #188](https://github.com/JTCAO515/VP-V4/issues/188) 原生 iOS 五入口、中英文与可访问的首个 Trip 页面
- [VPJ-02 #189](https://github.com/JTCAO515/VP-V4/issues/189) 现有 Staging 的真实身份、迁移与 owner 隔离验证
- [VPJ-03 #190](https://github.com/JTCAO515/VP-V4/issues/190) 用户对话、材料、模型地区与人工访问的数据政策
- [VPJ-04 #191](https://github.com/JTCAO515/VP-V4/issues/191) 原生登录、手机登录顶替与 Web 会话并存
- [VPJ-05 #192](https://github.com/JTCAO515/VP-V4/issues/192) 同一 Trip 在 iOS 与精简 Web 创建、编辑和重载
- [VPJ-06 #193](https://github.com/JTCAO515/VP-V4/issues/193) Qwen、GLM、DeepSeek 的真实调用与质量成本对照
- [VPJ-07 #195](https://github.com/JTCAO515/VP-V4/issues/195) 真实 Ask 得到可恢复的最终回答
- [VPJ-08 #196](https://github.com/JTCAO515/VP-V4/issues/196) 流式回答在断网、后台和跨端重连后接续
- [VPJ-09 #197](https://github.com/JTCAO515/VP-V4/issues/197) 从模糊想法得到可确认的多日行程
- [VPJ-10 #198](https://github.com/JTCAO515/VP-V4/issues/198) 选中一天或项目后与 VP 局部改稿
- [VPJ-11 #199](https://github.com/JTCAO515/VP-V4/issues/199) Trip 连续记忆与用户可纠正的偏好
- [VPJ-12 #201](https://github.com/JTCAO515/VP-V4/issues/201) 单张旅行截图导入、校正与加入 Trip
- [VPJ-13 #203](https://github.com/JTCAO515/VP-V4/issues/203) 首访与回访的三种入口获得首个成果
- [VPJ-14 #204](https://github.com/JTCAO515/VP-V4/issues/204) 受保护 Ops 登录与一条候选内容工作流
- [VPJ-15 #205](https://github.com/JTCAO515/VP-V4/issues/205) 首批旅程内容从来源登记到已审核可用
- [VPJ-16 #206](https://github.com/JTCAO515/VP-V4/issues/206) 有依据的回答、诚实部分答案与知识缺口
- [VPJ-17 #207](https://github.com/JTCAO515/VP-V4/issues/207) 来源更新后安全重验相关知识与 Trip
- [VPJ-18 #208](https://github.com/JTCAO515/VP-V4/issues/208) 高德、百度、腾讯的真实使用地域与采购比较
- [VPJ-19 #209](https://github.com/JTCAO515/VP-V4/issues/209) 地点消歧、地图展示与路线出口
- [VPJ-20 #210](https://github.com/JTCAO515/VP-V4/issues/210) Explore 浏览内容并保存、问 VP、加入 Trip
- [VPJ-21 #211](https://github.com/JTCAO515/VP-V4/issues/211) 准备检查把关键缺口变成可做的下一步
- [VPJ-22 #212](https://github.com/JTCAO515/VP-V4/issues/212) 酒店联盟授权与深链落地验证
- [VPJ-23 #213](https://github.com/JTCAO515/VP-V4/issues/213) 住宿需求比较与透明联盟跳转
- [VPJ-24 #214](https://github.com/JTCAO515/VP-V4/issues/214) 第三方订单材料回到同一 Trip
- [VPJ-25 #215](https://github.com/JTCAO515/VP-V4/issues/215) Today 与可离线读取的旅行资料
- [VPJ-26 #216](https://github.com/JTCAO515/VP-V4/issues/216) 中英现场表达与大字展示
- [VPJ-27 #217](https://github.com/JTCAO515/VP-V4/issues/217) 按需语音翻译与可中断播放
- [VPJ-28 #218](https://github.com/JTCAO515/VP-V4/issues/218) 地点讲解与语音追问接回当前 Trip
- [VPJ-29 #220](https://github.com/JTCAO515/VP-V4/issues/220) 用户报告变化后的局部恢复
- [VPJ-30 #221](https://github.com/JTCAO515/VP-V4/issues/221) 有原因、可关闭的旅行提醒
- [VPJ-31 #223](https://github.com/JTCAO515/VP-V4/issues/223) 按服务任务授权的动态 Traveler Brief
- [VPJ-32 #224](https://github.com/JTCAO515/VP-V4/issues/224) 真人协助从请求到接单和结果回传
- [VPJ-33 #225](https://github.com/JTCAO515/VP-V4/issues/225) Journey Pass 商品、权益和定价实验配置
- [VPJ-34 #226](https://github.com/JTCAO515/VP-V4/issues/226) 官方 IAP 购买、恢复与服务端权益
- [VPJ-35 #227](https://github.com/JTCAO515/VP-V4/issues/227) Free/Pass 额度与完整任务成本控制
- [VPJ-36 #228](https://github.com/JTCAO515/VP-V4/issues/228) 核心资料的导出删除框架与首批执行器
- [VPJ-37 #229](https://github.com/JTCAO515/VP-V4/issues/229) 运营看见质量、成本和故障并能停用能力
- [VPJ-38 #230](https://github.com/JTCAO515/VP-V4/issues/230) 数据库、对象与删除状态的恢复演练
- [VPJ-39 #232](https://github.com/JTCAO515/VP-V4/issues/232) 境内外媒体、酒店跳转、IAP 与通知网络验收
- [VPJ-40 #233](https://github.com/JTCAO515/VP-V4/issues/233) 原生视觉动效、无障碍与性能整链复验
- [VPJ-41 #234](https://github.com/JTCAO515/VP-V4/issues/234) 精简 Web Planning Studio 的最终体验验收
- [VPJ-42 #242](https://github.com/JTCAO515/VP-V4/issues/242) TestFlight 实机贯通 Plan、Ready、Travel 三段
- [VPJ-43 #243](https://github.com/JTCAO515/VP-V4/issues/243) 独立 Production 与可回滚的客户服务环境
- [VPJ-44 #244](https://github.com/JTCAO515/VP-V4/issues/244) 正式 App Store 1.0 提交与数字商品审核
- [VPJ-45 #245](https://github.com/JTCAO515/VP-V4/issues/245) 客户收到产品后的观察、支持与发布关账
- [VPJ-46 #246](https://github.com/JTCAO515/VP-V4/issues/246) 每周35小时客户发现、招募与材料工作坊
- [VPJ-47 #247](https://github.com/JTCAO515/VP-V4/issues/247) 真实激活、付费与人工成本的经营观察
- [VPJ-48 #235](https://github.com/JTCAO515/VP-V4/issues/235) 用户旅行内容投稿与发布前审核
- [VPJ-49 #241](https://github.com/JTCAO515/VP-V4/issues/241) 最简本地旅行分享卡与隐私预览
- [VPJ-50 #248](https://github.com/JTCAO515/VP-V4/issues/248) 有真实召回失败才启用混合 RAG 与重排
- [VPJ-51 #249](https://github.com/JTCAO515/VP-V4/issues/249) 航班来源采购与中国航线实测
- [VPJ-52 #250](https://github.com/JTCAO515/VP-V4/issues/250) 授权航班状态与相关行程重验
- [VPJ-53 #251](https://github.com/JTCAO515/VP-V4/issues/251) Android 与新增语言的需求触发设计
- [VPJ-54 #252](https://github.com/JTCAO515/VP-V4/issues/252) 长期订阅或交易深度升级的证据决策
- [VPJ-55 #236](https://github.com/JTCAO515/VP-V4/issues/236) 文件与系统分享导入、邀请链接接回原意图
- [VPJ-56 #237](https://github.com/JTCAO515/VP-V4/issues/237) 原生 CI、签名 Archive 与首个 TestFlight 安装包
- [VPJ-57 #222](https://github.com/JTCAO515/VP-V4/issues/222) 用户服务请求与按任务授予资料访问
- [VPJ-58 #239](https://github.com/JTCAO515/VP-V4/issues/239) 全数据模块导出删除与恢复后的最终隔离验收
- [VPJ-59 #194](https://github.com/JTCAO515/VP-V4/issues/194) 首个真实模型任务的预算预留与故障止损
- [VPJ-60 #200](https://github.com/JTCAO515/VP-V4/issues/200) 图片和语音 Provider 的中英质量与数据流验收
- [VPJ-61 #240](https://github.com/JTCAO515/VP-V4/issues/240) 旅行结束、归档与下一次回来
- [VPJ-62 #202](https://github.com/JTCAO515/VP-V4/issues/202) 公开中英申请入口与隐私可控的招募漏斗
- [VPJ-63 #231](https://github.com/JTCAO515/VP-V4/issues/231) 登录、Ask 与 Trip 的境内外网络首轮探针
- [VPJ-64 #238](https://github.com/JTCAO515/VP-V4/issues/238) 社区举报、屏蔽、申诉与内容删除
- [VPJ-65 #219](https://github.com/JTCAO515/VP-V4/issues/219) 真实地点与依据支撑的完整计划核验
