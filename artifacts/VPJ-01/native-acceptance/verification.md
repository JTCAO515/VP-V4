# VPJ-01 原生无障碍收尾准备

基线main080d5f0（包含PR274品牌资产）；隔离工作树codex/vpj-01-native-acceptance，保留原工作树。当前阶段是可验证的局部改进，不关闭#188。

## 修改与证据口径

- 提高Ask/Trip及共享页头/预览说明的辅助文字对比度，保留深浅主题。
- 将发送不可用说明从底部叠加层移到滚动内容；可见、可访问且保留相同文案。
- 保留主线已有品牌朗读标签；发送箭头按装饰图标尺寸固定，44pt点击区域不变。
- 原生UI测试为中英启动明确语言/地区和字号，完整审计不使用issue过滤。最大字号验证滚动到完整可见位置，正常字号执行全部审计种类。

正常中英完整审计在20260909-215104通过。后续完整套件和最低系统版本结果以commands.jsonl及最终结果表为准，不能用较早通过记录覆盖后续失败。

## 保留的诊断失败

最大字号完整contrast probe仍为FAIL：初始viewport的简介仅露出一部分时失败；保持颜色不变并滚动到简介完整frame (16,146,368.33,435.33)、可视竖直范围124...694后，失败对象变成另一边缘标题。代码与复现见viewport-probe.md，原始xcresult保留在命令记录对应本机缓存路径。此相关性不等于整个最大字号对比度验收通过。

早期/tmp日志在环境中断后丢失；未完成的运行不记通过。重跑后统一保存到Library/Caches/visepanda/native-acceptance，按实际退出码记录。

## 最低系统诊断

iOS17.5的完整审计已实际执行且FAIL。中文预览说明被报告为Text clipped；字号/布局对照又暴露输入区后方prompt的Contrast failed。原始失败截图及试验范围见[iOS17诊断](ios17-diagnostics/README.md)。无效试验均撤回，未通过issue过滤或隐藏文本更改结果。

## 尚未满足的父任务验收

真机VoiceOver及所选Trip对象Ask sheet仍需实际验证/接入。iOS17.5已下载并安装，已创建专用iPhone15 Simulator；只有实际测试结果才证明运行通过。未新增网络、账号、provider或Trip写入。

依据ADR-0024，局部原生改进复用既有合同；本地执行受影响原生build/tests、docs/diff。完整必需CI和独立准确HEAD审阅仍为合并门；不重复无关本地Web界面QA。

## 最终源码验证（2026-09-10）

Xcode26.6 (17F113)，基线080d5f0。两次全套运行之间无Swift或测试源码修改。

| 环境 / 运行ID | 单元 | UI | 退出码 / 结论 |
| --- | --- | --- | --- |
| iPhone17Pro / iOS26.5 / 20260910-011026 | 8/8 PASS | 7/7 PASS | 0，当前原生回归通过 |
| iPhone15 / iOS17.5 / 20260910-011653 | 8/8 PASS | 3 PASS / 4 FAIL | 65，最低系统无障碍验收未通过 |

26.5包括中英正常字号深浅完整.all审计、最大字号四组合layout/完整说明frame断言、双语切换保留草稿、五tab/Today/Translation路由及Tools/Today最大字检查。最大字号测试明确不包含contrast；保留的完整contrast诊断仍FAIL。

17.5失败方法：`testAccessibilityAtLargestTextSize`、`testAskAndTripFullAccessibilityInDarkMode`、`testAskAndTripFullAccessibilityInReleaseLanguages`、`testToolsAccessibilityAtLargestTextSize`，均报告Text clipped（Tools的element为nil）。最大字方法在说明滚动后的审计停止；深浅完整审计在中文说明停止，不能称所有后续Trip组合已执行。中文切英文保留草稿、五tab/Today/Translation路由、Today最大字三项通过。

- [26.5最终截图清单](ios26-final/manifest.json)、[17.5最终失败附件](ios17-final/manifest.json)。截图无图像编辑。最大字号截图在audit之后拍摄，系统审计可能重新定位滚动位置；完整说明可见性由audit之前的frame断言证实，截图不能替代该断言或真机朗读。
- 完整运行命令/退出码见[commands.jsonl](commands.jsonl)；原始xcresult和日志位于记录的Library/Caches路径。`tested-source.json`记录受影响源码blob，便于对应准确审阅HEAD。
- `pnpm docs:check`、`git diff --check`通过。仅原生Swift/测试/证据受影响，本地Web运行验证不适用（ADR-0024）；完整必需CI及独立HEAD审阅仍由主任务执行。
- xcodebuild两次均报告诊断采集子进程找不到simctl；主命令使用明确DEVELOPER_DIR且测试实际执行、xcresult完整。该诊断警告不是iOS17失败的原因，也未被当作测试通过依据。

没有新增真实选区sheet、账号/provider、Trip写入、签名安装或Store操作。VPJ-01保持开放；最低系统失败、完整最大字号contrast、真机VoiceOver和真实选区sheet是未满足的验收门。

## 有界后续诊断与既存问题对照

[两条假设与同设备基线对照](hypothesis-checks/README.md)新增了完整可见帧、测试注入hash及main080/候选3f的同一`.all`证据。subheadline仍在完整可见位置报中文裁切；视口间隙试验未建立通过条件，修改已撤回。两个指定失败点在旧main也复现：中文同句Text clipped，Tools动态字号/裁切。候选在这两个定向场景中没有新增问题类别，但这不是全状态无回归结论，也不解除17.5/最大字contrast/真机/sheet门。此次只追加证据，原生代码保持3f3b651。
