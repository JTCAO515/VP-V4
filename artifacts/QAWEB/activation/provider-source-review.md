# 官方来源候选：尚未发布，不能激活

独立查阅：2026-10-13 14:52–14:55（Asia/Shanghai）。公开原文经 Web 阅读；另以不带身份的 HTTPS GET 计算原始响应 SHA-256，见 `official-source-digests.json`。网页是动态内容，hash 标记本次响应，不保证未来响应一致。没有保存整页副本、登录账号或调用模型。

[官方价目](https://help.aliyun.com/zh/model-studio/model-pricing)：华北2北京固定 `qwen3.7-plus-2026-05-26`，输入在 (0,256000] 时输入/输出为 2/8 CNY 每百万 token；(256000,1000000] 时为 6/24。输入阶梯决定整次请求费率，思考输出包含 reasoning 与回答。候选使用上档 6/24，换算 6000000/24000000 currency micros per million，不用折扣、赠额、Batch 或缓存优惠。文档提示显式缓存创建可有额外计费；不能把该场景假定包含于标准输入价。

[地域原文](https://help.aliyun.com/zh/model-studio/regions)：旧 `dashscope.aliyuncs.com` 对应 cn-beijing，为存量兼容入口，2026-09-30 起不再支持新特性。固定 endpoint 保留，不迁移。地域决定接入与数据存放，推理位置另受部署范围决定；不据此冒认本账号配置或全链路存储。

[北京细则](https://help.aliyun.com/zh/model-studio/beijing-access-information)：2026-10-13 前北京上线模型适用中国内地推理；该日开始上线模型默认中国弹性区。固定五月快照可据公开规则提出内地处理候选，不能声称已实测。北京接入不等于只在北京推理。

[隐私原文](https://help.aliyun.com/zh/model-studio/privacy-notice)：公开声明数据不用于训练，但依法保存调用数据；该页面没有明确 API 留存 TTL。候选保留这一差别，不声称零留存。账号所接受条款版本、签约主体、真实 key/权限、源 runtime 区域和端到端 storageRegion 均未核实。

`supplier-price-candidate.json` 是带状态外壳的候选，`inputCandidate` 才是未来生成器输入。owner、configuration、预算上限和有效期仍 null，coverage=false，直接生成必须失败。supplier evidence 指向隐私页；地域和价格分别用各自证据，不把单页当成全部证明。termsVersion/sourceRegion/storageRegion 的 unknown 是实际未知。24 小时重新核对期限是本地审阅值，不是供应商保证的价目有效期。

需要 Main 审明的技术边界：原预留公式 1,048,576 大于官方十进制上限 1,000,000。高档原价乘更大基数可作保守预留，但不能宣称供应商提供超范围报价；确认真实请求范围后再确认 coverage，不擅改公式/模型。以现有公式计算：128 output 上限需预留 6.294528 CNY；4096 output 上限为 6.389760 CNY。这只是数学上界，不是实付或已批准预算。task/scope/provider 实际总额和过期时间需 Main 明确，不能用价目代替资金授权。

本轮仅公开网页只读和候选文件；真实 provider/auth/部署/费用全部 UNRUN。迁移 manifest 已按 Main a8f00e8a 的稳定源 hash 复核更新，版本仍为155。
