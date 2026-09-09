# VP-V4：你现在需要做的步骤

更新：2026-09-09。适用于已经在 Xcode 克隆 VP-V4、完成 GitHub 用户名/PAT 认证的你。

## 先看结论

GitHub 这一步已经完成，不用重新 clone，也不用把 PAT 发给任何人。
你已允许本轮 VP-V4 生产发布及 main 合并触发的 Vercel 部署；agent负责检查、独立审阅、合并和发布验证。
生产数据库迁移、旧库复用、付费购买、账户权限扩大与尚未批准的法律/素材决定仍需分别处理。

你现在优先做下面的第1步；第2、3步让你看到已经实现的原生界面。真机部分可稍后再做。
“生产网站已部署”和“完整 App 已上线”是不同结果：当前原生仍是没有真实账号/AI/Trip写入的开发界面。

## 1. 找到正确的 Supabase 测试项目（优先）

Supabase 是后续保存账号和行程的后台。GitHub PAT 不会自动登录 Supabase。

1. 打开 https://supabase.com/dashboard ，登录你当初创建 VP-V4 后台时使用的账号。
2. 在控制台查看所属组织及各组织的项目，找到现有的 VP-V4 Staging（测试环境）。项目实际名称可能不同，不要仅凭名字推定用途。
3. 记下项目名称和地区，并根据你的实际使用情况确认：这里是否没有真实客户、真实旅行材料和正式业务数据。
4. 只把下面这些非敏感信息回复给agent：

   ```text
   V4 测试项目名称：
   所在地区：
   是否确定没有真实用户/真实业务数据：是 / 否 / 不确定
   是否已有两个专用测试账号：有 / 没有 / 不确定
   ```

此前连接器仅能看到旧 VP-Final 项目，本地 V4 的 user/ops/worker 连接也未配置。
如果你只找到旧项目，就回复“只找到旧项目”；如果完全不记得创建过，就回复“不确定是否有 V4 测试项目”。
此时不要自己删除项目、复制旧库、运行 SQL、执行迁移或重新建库。先确认环境归属和地区，再决定缺失的准备步骤。

网页登录和agent的连接器授权不一定同步。如果你能看到正确项目而agent仍看不到，再通过当前连接器的官方登录/重新授权入口连接同一账号和组织；具体入口以你看到的界面为准。
不要为排查问题打开全部数据库权限或关闭 RLS。密码、API key、PAT、cookie、数据库连接字符串均无需发送到聊天。

项目按组织管理，每个项目有自己的主地区：[Supabase 项目说明](https://supabase.com/docs/guides/platform)、[地区说明](https://supabase.com/docs/guides/platform/regions)。

## 2. 更新你已经克隆的代码

1. 打开 Xcode 中你已经 clone 的 VP-V4 仓库。
2. 确认当前分支是 `main`。
3. 从菜单选择 **Integrate → Pull**，获取已经合并的更新。不同旧版 Xcode 菜单可能叫 **Source Control → Pull**。
4. 如果弹出本地修改、覆盖或冲突提示，保留当前内容，不选择 Discard/丢弃；把提示文字发来即可。
5. 更新后，在 Finder 中打开这份克隆的文件夹，应能看到 `ios` 文件夹。

这一步只是取回新代码，不需要重新创建 PAT。如果你没有看到 `ios`，先确认本次 Pull 是否成功、当前是否为 `main`，不要重建工程。

[Apple 官方代码更新说明](https://developer.apple.com/documentation/xcode/configuring-your-xcode-project-to-use-source-control)。

## 3. 用 iPhone 模拟器运行

1. 在 Finder 中依次打开 **ios → VisePanda → VisePanda.xcodeproj**，双击最后这个工程文件。
2. 在 Xcode 顶部，方案（scheme）选择 **VisePanda**。
3. 在它旁边的运行设备选择一个 **iPhone Simulator**。当前本机已验证过 iPhone 17 Pro / iOS 26.5；选择可用的 iPhone 模拟器即可。
4. 点击左上角三角形 **Run**，也可按 **⌘R**。
5. 第一次启动可能需要等待编译和模拟器开机。若 Xcode提示缺少平台组件，按官方提示下载安装后再运行。
6. 成功后应默认进入 Ask；底部有 **Trip / Explore / Ask / Tools / Profile** 五个入口（中文对应行程/探索/问熊猫/工具/我的）。
7. 在 **Profile / 我的 → Language / 语言** 中切换中文和 English。输入草稿后可用键盘上的 **完成 / Done** 收起键盘。

当前“发送”禁用、工具显示预览，是本次实现的真实范围，不是你登录失败。先完成后台身份与真实接口验收后才会逐项开放。
模拟器运行不需要购买 Apple Developer 会员，也不需要提交 App Store。

遇到失败：展开第一条红色错误，把它的文字发来；不要只说“很多报错”，也不用粘贴整段可能包含私密配置的日志。
[Apple 中文运行教程](https://developer.apple.com/cn/documentation/xcode/running_your_app_in_the_simulator_or_on_a_device/)。

## 4. 可选：之后装到你自己的 iPhone

GitHub 账号负责代码访问；Apple Account 与 Team 用于真机签名，是另一个环节。

1. 用数据线连接并解锁 iPhone，按系统提示完成信任/配对。
2. 在 Xcode 的账户设置中登录自己的 Apple Account。
3. 选中 VisePanda 工程里的 VisePanda 应用 target，在 **Signing & Capabilities** 选择自己的 Team，并按 Xcode 的签名提示操作。
4. 如果当前签名方式不接受固定 Bundle Identifier，先把错误发来，由agent准备本地配置；不要随意改共享发布标识或他人的 Team。
5. 将运行目标从模拟器改成这台 iPhone，点击 Run。
6. 若系统提示 Developer Mode，按照 iPhone/Xcode 的官方指引启用并重启；只处理这次明确的开发设备操作。

个人真机试用可使用 Personal Team；有相应使用限制，不等于可向客户分发。当前不要求购买会员，也不进行 App Store/TestFlight 提交。
[Apple 个人测试与会员说明](https://developer.apple.com/support/compare-memberships/)、[Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)。

## 5. 后续需要你确认的真实资料

这些不是技术选项，agent不能替你虚构。暂时不知道就写“待定”：

- 实际经营/负责主体及用户联系渠道。
- 哪些真实用户资料需要保留、保留多久，撤回/删除后怎样处理。
- 实际选择的模型/媒体服务接收方与处理地区，以及已有合同/许可。
- 招募表中的研究同意和营销同意、回执与退出方式。

现在不必为了继续运行模拟器而猜填这些值。确认后，agent会把已接受的决定转成配置、合同和测试。

## 你现在可以直接回复

```text
我在 Supabase 找到的项目是：
地区是：
里面是否有真实用户/真实数据：
是否已有两个专用测试账号：
模拟器是否已打开：
第一条错误（如果有）：
```

生产发布的授权已经记录，无需逐个 PR 重复批准。agent继续负责代码、测试、CI、独立审阅、普通合并和已授权部署；你只处理实际账号登录及不能代定的业务/法律信息。
