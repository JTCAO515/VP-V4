# 当前公开 DB 绑定：维护不能标为 only-Staging

2026-10-13只读核验，原 Vercel项目 prj_XwsjEc8YnYNeDVAqBrcdmbJXEqA2 / team_vLT8SL2mQJJSnXbD9GzVLP4K，现有CLI身份jtcao515。证据来自官方 alias→deployment metadata，以及这6个已知域名公开HTML实际引用的同origin静态JS。仅提取Supabase hostname/ref，不选择、解码、输出或保存key/JWT/cookie、其它bundle内容；不用env getter或解密，不提交登录、不读用户数据、不改任何资源。

**当前已部署的Production、QA和旧Staging浏览器配置均指向 `https://dzqdzetcctkhbrhlxxgn.supabase.co`。** 因而以这个库执行迁移/维护，至少需要覆盖Production浏览器调用端，不能由“QAFLAG关闭”或历史文档标题推导仅Stage授权。公开配置不证明当前有用户活动或全部server runtime相同，未知项保持未知。

| 当前入口 | 官方部署/环境 | 当前公开browser ref |
| --- | --- | --- |
| go2china.space / www.go2china.space / testing.go2china.space / vp-v4.vercel.app | 同 dpl_9t4iY7YF48r9Suru34hZFdxH8sdw，READY / production；SHA30e9801309803ea06d38e7cb2df3249aa4741436，hotfix/next-16-3-6-20260923 | dzqdzetcctkhbrhlxxgn，四alias逐个静态bundle观察到 |
| qatesting.go2china.space | dpl_Fecxy5fLhyxBgNf5dLzRNFcRVDS1，READY / preview；SHAe9d455e7fe6ab2b6aea71e36998f2655b9610e88，codex/qaw005-main-20261013 | 同ref |
| staging.go2china.space（旧活跃Preview） | dpl_5eBh1Exfo4W8rXEh1T3AazJnUjXW，READY / preview；SHAb542eadff6a5057445c6d3311ebd5d166c0dad55，codex/s2-native-ask-io-20260911 | 同ref |

完整非秘密证据和asset路径：current-public-bindings.json。采样源public-bindings.py只访问已知6个project域名及HTML引用的/_next/static/*.js；唯一允许的query是公开dpl cache标记，无保护/身份绕过、外部origin、猜测chunk或env值读取。之前未接受该cachequery的采样没有检查到assets，已修正后实际复采得到上表；不把旧UNKNOWN当隔离证据。没有重复viewport/UI矩阵。

## Native、环境与控制边界

- 当前公开Native源 e9d455e7：testflight-staging.json引用staging.go2china.space；NativeEnvironment.plist未提供可直接提取的Supabase/VP hostname。已安装App/build及其真实网络目标UNKNOWN。
- public Native server-config源固定Staging ref为dzqd；production guard要求操作员给出的生产ref不同于dzqd。这里只是源码契约，不证明当前Production部署flag/ref或Native用户可用。具体Native holder、安装版本、启用的Staging/Production入口和后台调用者需Main/原owner核实。
- Production等browser编译配置已观察；server runtime、Development env值、所有历史immutable deployment和直接API调用者没有逐一读回，UNKNOWN。不取全env/任何key来填空。
- 已打开browser/SDK可直连Supabase，Auth refresh及已进入函数/事务也不受Vercel域名WAF阻断。已知worker聚合为0或仅HTTP deny不能证明所有调用者静默。
- Main为统筹；此chat只保留QA Vercel scoped唯一writer，不拥有Production维护或直接DB/Native/ECS控制权。旧Preview/Production/Native/controller与在途writer清单尚未完整，不能自行停机。
- JT最新metadata中继只证明实例校验true和当时key目录不存在；没有导入完成/worker ready回执。宿主Node22当前UNKNOWN，需JT本人只输出command existence/version metadata。96a8新增QA target验证源要求Node22，不能沿用a212“无需宿主Node”的旧断言；此处不安装软件。

## 给BestJ一次集中JT决定的最小选择（仅方案，未执行）

1. **保留共享库，明确共享维护窗口。** 授权对象必须写成上述Production4alias＋QA＋旧Staging以及确认过的Native/直连SDK/worker/operator调用端；Main协调原owner停止新写入/claim与在途收敛，验证备份/恢复、实际schema与75→155精确差异。域名deny不能替代DB直连调用者控制。没有完整caller/control/quiet证据就保持DB升级BLOCKED，而非只允许Stage误写。是否短暂停Production、谁执行哪些控制、窗口与回退均需JT明确；本只读任务不执行。
2. **先做确切隔离，再以QA范围升级。** 如果有已授权且确认无Production调用者的独立QA库，Main可提出绑定/代码契约/schema/账号与费用差异供JT选择；若没有，另列新资源/权限/费用供批准，不自行创建。当前QA源对固定ref有显式守卫，不能只换环境URL或密钥来假称隔离；更不能自动复制真实用户/Auth/Trip/预算或切Production。隔离就绪前原共享库不变。

一次决定需填实际caller owners/control、维护或隔离目标ref、恢复点/版本/批准窗口/费用与回退责任；不能借QA部署、Root code merge或隐藏输入包推导这些授权。全程没有env/WAF/domain/host/schema/key/budget/provider写入或停机。
