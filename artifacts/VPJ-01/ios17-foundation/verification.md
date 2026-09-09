# #188 本轮有界诊断与人工交接

基线 `cfde140d16508aa360438b820a224bf0ea541873`，独立工作树 `VP-V4-iOS17-Accessibility`。
本轮没有证实可保留的UI修复；所有临时产品/测试修改已撤回，既有四项iOS17.5失败仍然是FAIL。
没有将职责澄清、诊断或正常截图当作最低系统/旁白通过。

## 已结束的检查

Xcode26.6，专用iPhone15 Simulator/iOS17.5。全部审计回调返回false，无issue过滤。

| 本机运行ID | 单变量/测量 | 终态 |
| --- | --- | --- |
| 055649 | 中文正常字号，固定app字号/不固定各一次完整.all | exit65；两者都报告同一句Text clipped |
| 060155 | 说明文字使用loose leading | exit65；未改变同一提示，撤回 |
| 060531 | Tools使用Simulator系统最大字号，不设置app字号覆盖；完整.all | exit65；2个Dynamic Type nil和1个Text clipped nil仍在 |
| 060933 | 说明文字增加maxWidth frame | exit65；同一提示/实际AX文本框不变，撤回 |
| 061246 | 移除说明文字fixedSize | exit65；同一提示仍在，撤回 |
| 061720 | Trip最大字号编号实际AX框与UIFont caption参照比较 | exit0；3个框高51.33pt，参照51.31pt。未证实此前“固定28pt必然裁切”的代码推断 |

Tools最大字号的Translation框高85.33pt、Address框高147.33pt，确认字号确实放大。
系统字号在该检查后恢复为原来的`large`。详细提示为“User will not be able to change the font size…”
及“Text … may be clipped at larger Dynamic Type sizes”；nil没有指向可确定修复的具体元素。
正常中文元素图的深色字形在888×46px图内为(1,5)…(881,40)，未接触上下边界；这不能证明大字号或旁白通过。
编号测量只证明AX尺寸，不是整屏视觉/对比度或旁白验收。按root要求，停止继续类似试验。

可核查资料：[命令/退出码](commands.jsonl)、[精简观测](observations.json)、[临时诊断代码](diagnostics.patch)。
原始xcresult/log保留于 `/Users/jtcao/Library/Caches/visepanda/ios17-accessibility/20260910-<运行ID>/`。
三个代表截图：[中文正常字号](screenshots/chinese-normal.png)、[系统最大字Tools](screenshots/tools-system-largest.png)、
[Trip编号](screenshots/trip-workflow-largest.png)。它们均来自Simulator，不是真机证据。

现有匹配主线对照在[前轮记录](../native-acceptance/hypothesis-checks/README.md)，本轮没有重新解释为通过。
Apple说明裁切审计关注较大Dynamic Type尺寸，自动审计也不能替代辅助技术使用验证：
[官方审计说明](https://developer.apple.com/documentation/accessibility/performing-accessibility-audits-for-your-app)。

## 人工前置和准确未运行项

两次只读设备列表均显示iPhone17 `unavailable`。iOS26.6.1仅来自用户说明，未核到设备实际系统或App构建。
未安装/覆盖手机App，未改变签名、证书或手机设置。详细可执行步骤在
[真机与旁白教程](device-voiceover-guide.md)：连接/信任 → root核对测试构建及安装影响 → 用户授权后再测试。

真机VoiceOver、中英最大字号/深色/Reduce Motion与匹配构建的观察均UNRUN；这些不能由现有模拟器图代填。
设备连接和匹配构建确实仍UNRUN；准备具体构建及影响后判断现有授权范围，只对新增签名/账户配置或未知数据覆盖等超范围动作确认。#198/#233/#242真实选区链路不再阻塞#188。
本轮只提交证据与教程，原生源/测试代码保持基线；不再重复无关完整套件或增加新fixture。
