# 客户发现访谈包：提纲、编码表与优先级回写

归属：VPJ-46 [#246](https://github.com/JTCAO515/VP-V4/issues/246)。配合[两周试点](customer-discovery-pilot.md)与[招募草稿](customer-discovery-outreach.md)使用。本提纲扩展试点文件中的通用 30 分钟提纲，聚焦来华规划、支付/网络/交通、AI 行程助手与 Journey Pass 付费意愿；记录仍用试点文件的“每次记录模板”，本文件只补充编码字段。

## 本轮要检验的假设

| ID | 假设 | 支持它的行为证据 | 相关 Issue |
| --- | --- | --- | --- |
| H1 | “常驻 Ask + Trip 确认”是用户最想要的首个价值：随时问，VP 给出可见改动，用户确认后写入同一 Trip | 过去真实发生过“反复改行程、需要把答案落进计划”的场景；原型/协助中主动要求或完成确认这一步 | #195 VPJ-07、#197 VPJ-09、#198 VPJ-10、#192 VPJ-05、#203 VPJ-13 |
| H2 | 首个价值其实是落地准备：支付、网络、入境与 App 安装清单 | 出发前在这些事上花了明确时间或出过事，Ask/行程未被主动提起 | #211 VPJ-21、#231 VPJ-63 |
| H3 | 首个价值是在途现场：交通、地点、问路与表达 | 在途卡住的实例集中在打车/地铁/铁路/找地点/沟通 | #209 VPJ-19、#216 VPJ-26、#217 VPJ-27、#220 VPJ-29 |
| H4 | 用户更想要真人兜底而不是 AI | 过去主动找人（朋友、代理、导游、酒店前台）解决，并表示不信任 AI 答案 | #224 VPJ-32、#222 VPJ-57 |
| H5 | 30 天 Journey Pass 与旅行周期匹配，并有付费可能 | 过去为同类帮助付过钱（eSIM、代办、导游、付费 App/攻略）；规划与出行时间差不超过 30 天或愿意在临近出发时购买 | #225 VPJ-33、#247 VPJ-47 |

小样本只产生待验证的方向，不证明需求规模或付费率。“有用”“会用”是口头反馈；过去做过、当场做了才是行为证据。

## 30 分钟提纲

开场沿用试点文件的说明：研究性质、自愿、可跳题或退出、只做文字笔记、默认不录音、不索要密码/验证码/支付信息/证件。先核对并记录本次研究 opt-in。网页申请的同意只覆盖联系与申请事件；访谈笔记的用途需在开场口头说明并得到同意。

### 0–3 分钟：背景

- 中：这次（或最近一次）去中国是什么样的旅行？几个城市、几天、和谁？是第一次吗？
- EN: Tell me about this (or your most recent) China trip — cities, days, who with? First time?

### 3–10 分钟：规划过程（Planning 重点）

- 中：从决定要去到订好主要行程，你具体做了哪些事？先从最近的一次讲起。
- EN: Walk me through what you actually did from deciding to go to having the main plan in place.
- 中：用了哪些工具、网站或人？哪一步花时间最多？最后是怎么定下来的？
- EN: Which tools, sites or people did you use? Which step took the longest? How did you settle it?
- 中：计划定下后又改过吗？改的时候怎么做的——在哪里记、怎么确认没漏？
- EN: Did the plan change after that? How did you make the change — where did you keep it, how did you check nothing broke?

记录：H1 相关的“改行程并落到计划”实例；耗时区分受访者估计与观察。

### 10–18 分钟：支付、网络、交通（Arriving/In-trip 重点）

逐项问“最近一次具体发生了什么”，不问“你觉得难不难”。

| 主题 | 中文 | English |
| --- | --- | --- |
| 支付 | 在中国怎么付钱？出发前做了什么准备？有没有付不了的时候，当时怎么办？ | How did you pay for things in China? What did you set up before going? Was there a time you couldn't pay — what happened? |
| 网络 | 到了之后怎么上网？出发前准备了什么？有没有哪个 App 或网站用不了，影响了什么？ | How did you get online after arriving? What did you prepare? Did any app or site not work, and what did that affect? |
| 交通 | 城市之间和城市里怎么走？订票、打车、地铁哪一步卡过？ | How did you get between and within cities? Where did booking, ride-hailing or metro get stuck? |
| 入境与其他 | 签证/免签、住宿登记、语言沟通上有没有意外？ | Any surprises with visa/visa-free entry, hotel registration or communication? |

不要索要支付截图、订单号、护照或签证页。受访者主动展示时，只看完成理解所必需的部分，不保存副本。

### 18–25 分钟：AI 与行程助手（检验 H1–H4）

- 中：你在这次旅行里用过 ChatGPT 之类的 AI 吗？具体问了什么，结果用上了吗？哪次不信它？
- EN: Did you use ChatGPT or another AI for this trip? What did you ask, and did you actually use the answer? When didn't you trust it?
- 中：当 AI 或别人给了建议后，你怎么把它变成真正的计划？
- EN: When an AI or someone gave you a suggestion, how did you turn it into your actual plan?

概念卡片排序（放在过去行为问题之后，避免引导）。读出或展示五张卡，请受访者选“出发前一周最想先有的一个”和“在中国当天最想先有的一个”，并说原因：

| 卡 | 中文 | English |
| --- | --- | --- |
| A | 随时问一个问题，VP 给出对你行程的具体改动，你看过改动后确认，行程就更新了 | Ask anything; VP proposes a specific change to your trip, you review it and confirm, and your trip updates |
| B | 出发前的落地准备清单：支付、网络、入境、要装的 App，逐项告诉你还缺什么 | A pre-arrival readiness checklist — payments, internet, entry, apps — showing what's still missing |
| C | 在当地的交通与地点帮助：怎么去、打车/地铁、给司机看的地址 | On-the-ground transport and places: how to get there, rides/metro, an address card for the driver |
| D | 现场翻译与大字中文表达卡 | Live translation and large-print Chinese phrase cards |
| E | 遇到问题时有真人帮你处理 | A real person who helps when something goes wrong |

如果只有原型或演示，先说明哪些是预设演示、哪些真实接通，再让受访者操作卡 A 的“提问→看改动→确认”一步；记录其是否主动要求确认/撤销、是否在确认处犹豫。按方式记为 Demo、Founder-assisted 或产品自助，三者不合并计数。

### 25–28 分钟：付费意愿（检验 H5）

先问过去，再给参考价；口头反应只记为弱信号。当前 Journey Pass 不可购买，不收款，不承诺价格或额度。

- 中：这次旅行你为“帮助”花过钱吗？比如 eSIM、代订、导游、付费 App 或攻略？多少钱、值不值？
- EN: Did you pay for any kind of help on this trip — an eSIM, booking service, guide, paid app or guide book? How much, and was it worth it?
- 中：如果有一个 30 天、不自动续费的旅行助手通行证，大约 19.99 美元，你会在什么时候、什么情况下考虑买？什么情况下肯定不买？
- EN: If there were a 30-day travel assistant pass, no auto-renewal, around US$19.99, when and why would you consider it? When would you definitely not?
- 中：你是出发前多久开始规划的？你会在哪个时间点愿意开始这 30 天？
- EN: How far ahead of the trip did you start planning? When would you want those 30 days to start?

### 28–30 分钟：下一节点与收尾

沿用试点文件第 6 问：下一个自然旅程节点、是否愿意在那时回访（明确许可才回访）。感谢，并说明退出方式。

## 编码表

每条记录在试点模板之外补充下列字段。一个参与者可有多条任务实例；每条实例单独编码。

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| queue | P / A / I | Planning / Arriving / In-trip（含近期返回） |
| first_time | Y / N | 是否首次来华 |
| job | PLAN 行程、PAY 支付、NET 网络、TRANS 交通、PLACE 找地点、LANG 语言、STAY 住宿与登记、ENTRY 入境/签证、FOOD 餐饮、HUMAN 找人帮忙、OTHER | 本次实例的具体任务 |
| severity | 0 无 / 1 小麻烦 / 2 花明显时间 / 3 失败或改变行程 | 按实际后果，不按形容词 |
| workaround | 通用搜索、通用 AI、社区/社媒、OTA/订票平台、地图 App、朋友或当地人、代理/导游、放弃 | 实际使用的替代方案 |
| evidence | Q 原话 / B 观察或过去行为 / I 推断 | 同一结论优先 B |
| mode | Demo / FA / Self / 无 | 如有交付或原型接触 |
| chain | ASK_ONLY 只要答案 / ASK_TRIP 要答案落进行程并确认 / TRIP_EDIT 自己改计划 / NONE | 检验 H1 的核心字段 |
| card_pre / card_trip | A–E | 出发前与在当地的首选卡 |
| wtp | W0 无 / W1 口头愿意 / W2 为同类帮助付过钱 / W3 非金钱承诺（同意回访、转介绍、提供去敏材料）/ W4 实际价格机会 | 试点不收款；W4 仅在 #247 的真实机会出现时记录 |
| hypothesis | H1–H5 支持 / 反驳 / 无关 | 每条实例可对多个假设打标 |

编码只用去敏原话和行为描述。编码、汇总与原始笔记都不交给任何 AI 工具或新的第三方服务处理（见试点文件“隐私与存放”）。

## 每周汇总与回写 Issue 优先级

周五复盘在试点文件“每周汇总与需求矩阵”基础上，再做一张假设计分表：

| 假设 | 支持的独立参与者数（B 级证据） | 反驳的独立参与者数 | 仅口头 | 代表性去敏原话（≤2 条） | 判断 |
| --- | --- | --- | --- | --- | --- |
| H1 | | | | | 支持 / 反驳 / 不确定 |
| H2–H5 | | | | | |

判断规则（两周结束时，独立参与者 N ≥ 6 才做优先级建议；不足 6 只写“不确定，继续下一轮”）：

- **H1 支持**：Planning 队列中至少一半有 `chain=ASK_TRIP` 的 B 级实例，且 `card_pre` 或 `card_trip` 选 A 的人数在五张卡中最多或并列最多，且在原型/协助中至少 2 人主动完成或要求确认步骤。建议：维持 #195/#197/#198/#203 作为首个价值主线。
- **H1 反驳**：多数参与者的最高 severity 实例落在 PAY/NET/ENTRY/TRANS，且 A 不在多数人的首选里、`chain=ASK_TRIP` 实例少于 2 个。建议：把首个价值改为“准备检查/在途帮助”，提议提高 #211、#209、#216 的相对优先级，Ask 作为回答这些问题的入口而非行程改稿入口。
- **H4 较强**：至少一半参与者在 severity 3 实例中靠真人解决且明确不信任 AI 答案。建议：复核 #224 真人协助在首发中的位置。
- **H5**：只报告 W2/W3 人数与“规划到出行时间差”分布，交给 #247 判断商业指标，本票不下付费结论。
- 其他情况记为“不确定”，列出下一轮要补的队列或问题。

回写方式：agent 或 JT 起草一条去敏评论，由 JT 发到 #246（汇总）并视需要发到受影响 Issue。评论只含计数、编码和去敏原话，不含姓名、联系方式、精确日期或地点。优先级标签只由 JT 按 [triage 规则](../agents/triage-labels.md) 调整；本试点只提供证据和建议，不自动改票。

回写评论模板：

```text
VPJ-46 第 {1/2} 周发现回写（去敏）
样本：独立参与者 {N}（P {n} / A {n} / I {n}；首次来华 {n}）；访谈 {n}，交付 {n}（Demo {n} / FA {n} / Self {n}）
H1 常驻 Ask + Trip 确认：支持 {n} / 反驳 {n} / 仅口头 {n} → {判断}
H2 落地准备：… H3 在途现场：… H4 真人：… H5 付费：W2 {n}、W3 {n}
最高 severity 任务分布：PLAN {n}、PAY {n}、NET {n}、TRANS {n}、…
代表性原话：“…”（记录 ID R-xx）
建议：{维持 / 调整 #xxx 优先级 / 不确定并补样本}；限制：{样本、渠道偏差}
```
