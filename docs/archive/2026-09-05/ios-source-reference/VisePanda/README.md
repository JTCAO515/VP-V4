# VisePanda iOS

`IOS-01` 提供原生 iPhone SwiftUI 界面骨架，最低目标为 iOS 17，使用 Swift 6、Observation、`TabView` 与每个 Tab 独立的 `NavigationStack`。

## 当前范围

- 导航顺序固定为 Today、Trip、Ask、Explore、Profile；默认打开 Ask。
- 支持 `zh-Hans`、`en`、`es`、`ru`、`ar`；Arabic 使用 RTL。
- 所有内容均为本地 preview，明确不连接账号、实时数据、AI、预订、付款、Trip 写入或本地用户数据。
- `AppIcon` 与 `PandaMark` 复用仓库的 VisePanda 熊猫数字资产。当前 1024 App Icon 是从仓库内 512px 设计稿缩放而来，仅用于开发/Simulator；公开发布前需替换为已获准的原始 1024px 资产。

## 本地运行

Xcode 26.6 的完整开发者目录必须可用：

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
xcodebuild -project ios/VisePanda/VisePanda.xcodeproj \
  -scheme VisePanda \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGNING_ALLOWED=NO build
```

运行测试：

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj \
  -scheme VisePanda \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGNING_ALLOWED=NO
```

为 Simulator QA 指定启动语言时，可传入不持久化的 `-VisePandaLocale` 参数，例如 `ar`。没有该参数时，默认中文。

## 后续接入边界

iOS 只能通过未来冻结的服务端 API 接入认证、Chat、Trip、Knowledge、Media 和离线包。客户端不得直接访问数据库、持有模型/服务商密钥，或绕过 `Proposal → visible diff → confirm → atomic apply` 的 Trip 写入约束。
