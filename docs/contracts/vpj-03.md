# VPJ-03 文本数据政策交付索引

状态：政策材料部分完成，#190保持OPEN；版本2026-09-16（复核刷新，未新增未决问题清单）。

- [数据政策披露矩阵](../policy/vpj-03-data-disclosure.md)：对应 Issue #190 四条验收标准的当前代码验证结果
  （告知/留存/地域/第三方接收方、经营主体与Owner权限、材料两路径、Q36偏好范围）；2026-09-16 已按
  VPJ-75/76 新增的真实 HTTP 传输层复核并更新第4节接收方结论。
- [责任人已确认决定](../policy/vpj-03-text-decisions.md)：经营主体、长期正文留存/隐藏及团队权限范围。
- [接收方资格矩阵](../policy/vpj-03-provider-qualification.md)：官方服务/地区/条款与账号补证边界。
- [中英告知与数据生命周期审阅稿](../policy/vpj-03-text-notice-review.md)：具体数据/动作、拒绝/撤回/隐藏及材料两路径；仍为发布前待填模板，未进入同意界面。
- [VPJ-07执行接口](vpj-07.md)：只对新policy同意后的新文本记录执行，不启用Trip/偏好/材料/训练/fallback。
- [验证](../../artifacts/VPJ-03/verification.md)与[未验项](../../artifacts/VPJ-03/unrun.md)。

按[开发接入规则](../agents/development-integration-policy.md)，agent基于现有账号/API和实际配置安装版本化开发policy，供应商未披露字段如实记录；不等待工单、法务或产品许可。
保留用户同意、服务端权限与实际C2运行验证，文档或合成C0结果不替代真实链路验收。
回滚本次文档PR即可恢复前一材料版本；不删除既有证据，不更改已应用迁移，不恢复撤回/隐藏数据。
