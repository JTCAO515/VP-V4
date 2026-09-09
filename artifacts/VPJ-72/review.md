# VP local blind-review package

Local identity-blind review only; authored fixtures are exposed development examples, not an independent benchmark. Score semantics manually; use null for NOT_RUN and N/A only where stated.

Version: vp-response-quality-v1; rubric: vp-response-rubric-v1; bundle: b8c163e2daf68133d6cbc333668cd8ae79d1ae73fa70973290736139083e1997

## Address the current goal / 回应当前目标
- 0: Refuses an answerable request, omits its supported core, or blocks it with an unnecessary questionnaire. / 对可答请求全拒答、遗漏已支持核心，或用无必要问卷阻止成果。
- 1: Addresses part of the request but leaves an avoidable gap or buries the answer. / 回应部分请求，但留下可避免缺口或把答案埋在细节中。
- 2: Answers the supported goal directly; a partial answer preserves what is known and names the remaining gap. / 直接回答证据支持的目标；部分答案保留已知内容并指出剩余缺口。

## Evidence and qualifications / 证据与限定
- 0: Invents or contradicts a key fact, hides a decision-changing limit, or turns a suggestion into a guarantee. / 编造或违背关键事实、隐藏影响决定的限制，或把建议变成保证。
- 1: Keeps the main fact but leaves uncertainty or applicability unclear. / 保留主要事实，但不确定性或适用范围不清。
- 2: Preserves supported facts, negation and scope; separates known, unverified and merely proposed information. / 保留有依据的事实、否定和范围，区分已知、待核与建议。

## Useful next step / 可行下一步
- 0: Offers an unavailable action or unsafe retry, or gives no needed next step. / 提供不存在的动作或不安全重试，或遗漏必要下一步。
- 1: Suggests a plausible but vague or unnecessarily burdensome next step. / 下一步大致可行，但含糊或给用户增加无必要负担。
- 2: Names the safe action the user can take now without claiming it has been performed. / 明确用户现在可做的安全动作，不声称已经代为执行。

## Applicable preferences / 偏好适用
- 0: Invents memory, uses revoked context, or overrides the user's current explicit choice. / 虚构记忆、使用已撤回上下文，或用旧偏好压过当前明确选择。
- 1: Uses an allowed preference but overstates its relevance or mentions it mechanically. / 使用获准偏好，但夸大相关性或机械强调记忆。
- 2: Uses only relevant permitted preferences and respects the current request; no forced memory reference. / 只使用相关获准偏好，尊重当前请求，不刻意提及记忆。

## Information density / 信息密度
- 0: Excess detail hides the result, or brevity removes an essential qualification. / 冗长掩盖结果，或为简短删除必要限定。
- 1: The answer is usable but repeats information or makes important details hard to scan. / 答案可用，但有重复或关键细节不易找到。
- 2: Puts the result and decision-changing limits first, with detail proportional to this request. / 先给结果与影响决定的限制，细节量匹配当前请求。

## Natural English / 英文自然度
- 0: Literal translation, broken grammar or unnatural politeness makes the meaning hard to follow. / 直译、生硬语法或不自然客套影响理解。
- 1: Understandable English with some awkward phrasing or unnecessary formulaic language. / 英文可理解，但有别扭措辞或无必要套话。
- 2: Idiomatic, clear English written for the situation, preserving the same facts as the Chinese variant. / 英文自然清楚、适合情境，保留与中文版本一致的事实。

## Situational tone / 情境语气
- 0: Mocks distress, promises certainty, stereotypes the traveler or pretends a person has taken over. / 调侃困境、保证一定解决、刻板推断旅客，或假称真人接手。
- 1: Respectful but generic, overly cheerful in a failure, or unnecessarily distant. / 基本尊重，但套话明显、失败时过度轻松，或过于冷淡。
- 2: Warm, direct and calm; responds to the actual context without invented experience or reassurance. / 温暖、直接、沉着，贴合真实情境，不虚构亲历或保证。

## a3cf484611100f97f2233ecb-0 (en, H01)

> In this fictional H01 case, give the museum address and tell me what to show my driver.

> Synthetic receipt: address 1 Synthetic Museum Road, CN; current at the fixed H01 clock. Opening hours are unknown. No trip change, booking cancellation or human acceptance receipt exists.

### A

> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

### B

> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

N/A: preferences

## a3cf484611100f97f2233ecb-1 (en, H01)

> In this fictional H01 case, give the museum address and tell me what to show my driver.

> Synthetic receipt: address 1 Synthetic Museum Road, CN; current at the fixed H01 clock. Opening hours are unknown. No trip change, booking cancellation or human acceptance receipt exists.

### A

> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

### B

> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

N/A: preferences

## bcadebf9fd4e7a17aaed3988-0 (en, H01)

> In this fictional H01 case, give the museum address and tell me what to show my driver.

> Synthetic receipt: address 1 Synthetic Museum Road, CN; current at the fixed H01 clock. Opening hours are unknown. No trip change, booking cancellation or human acceptance receipt exists.

### A

> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

### B

> The museum is at 99 Invented Road. It is certainly open now.

N/A: preferences

## bcadebf9fd4e7a17aaed3988-1 (en, H01)

> In this fictional H01 case, give the museum address and tell me what to show my driver.

> Synthetic receipt: address 1 Synthetic Museum Road, CN; current at the fixed H01 clock. Opening hours are unknown. No trip change, booking cancellation or human acceptance receipt exists.

### A

> The museum is at 99 Invented Road. It is certainly open now.

### B

> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

N/A: preferences

## d10d5138ee96fa72518521b2-0 (en, H01)

> In this fictional H01 case, give the museum address and tell me what to show my driver.

> Synthetic receipt: address 1 Synthetic Museum Road, CN; current at the fixed H01 clock. Opening hours are unknown. No trip change, booking cancellation or human acceptance receipt exists.

### A

> The museum is at 99 Invented Road. It is certainly open now.

### B

> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

N/A: preferences

## d10d5138ee96fa72518521b2-1 (en, H01)

> In this fictional H01 case, give the museum address and tell me what to show my driver.

> Synthetic receipt: address 1 Synthetic Museum Road, CN; current at the fixed H01 clock. Opening hours are unknown. No trip change, booking cancellation or human acceptance receipt exists.

### A

> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

### B

> The museum is at 99 Invented Road. It is certainly open now.

N/A: preferences

## 3fb5c9f5feab05ffa4fb97c2-0 (en, H01)

> In this fictional H01 case, give the museum address and tell me what to show my driver.

> Synthetic receipt: address 1 Synthetic Museum Road, CN; current at the fixed H01 clock. Opening hours are unknown. No trip change, booking cancellation or human acceptance receipt exists.

### A

> A human colleague has accepted your case and is handling it now.

### B

> I have changed your confirmed trip and cancelled the booking.

N/A: preferences

## 3fb5c9f5feab05ffa4fb97c2-1 (en, H01)

> In this fictional H01 case, give the museum address and tell me what to show my driver.

> Synthetic receipt: address 1 Synthetic Museum Road, CN; current at the fixed H01 clock. Opening hours are unknown. No trip change, booking cancellation or human acceptance receipt exists.

### A

> I have changed your confirmed trip and cancelled the booking.

### B

> A human colleague has accepted your case and is handling it now.

N/A: preferences

## beb8cf1342b72c58b5b40175-0 (en, H01)

> In this fictional H01 case, give the museum address and tell me what to show my driver.

> Synthetic receipt: address 1 Synthetic Museum Road, CN; current at the fixed H01 clock. Opening hours are unknown. No trip change, booking cancellation or human acceptance receipt exists.

### A

> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

### B

> I cannot provide any help until you complete your entire travel profile.

N/A: preferences

## beb8cf1342b72c58b5b40175-1 (en, H01)

> In this fictional H01 case, give the museum address and tell me what to show my driver.

> Synthetic receipt: address 1 Synthetic Museum Road, CN; current at the fixed H01 clock. Opening hours are unknown. No trip change, booking cancellation or human acceptance receipt exists.

### A

> I cannot provide any help until you complete your entire travel profile.

### B

> The verified address is 1 Synthetic Museum Road, CN. Show this address to your driver; today's opening hours are not verified.

N/A: preferences

## 3cf082b668d0baec586f4771-0 (zh, H01)

> 在这个虚构H01案例中，请提供博物馆地址，并告诉我向司机出示什么。

> 合成回执：地址为 1 Synthetic Museum Road, CN，在固定H01时钟下有效。开放时间未知，没有行程更改、订单取消或真人接单回执。

### A

> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

### B

> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

N/A: preferences, english_naturalness

## 3cf082b668d0baec586f4771-1 (zh, H01)

> 在这个虚构H01案例中，请提供博物馆地址，并告诉我向司机出示什么。

> 合成回执：地址为 1 Synthetic Museum Road, CN，在固定H01时钟下有效。开放时间未知，没有行程更改、订单取消或真人接单回执。

### A

> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

### B

> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

N/A: preferences, english_naturalness

## f22e5fea4b8a1f109c855d77-0 (zh, H01)

> 在这个虚构H01案例中，请提供博物馆地址，并告诉我向司机出示什么。

> 合成回执：地址为 1 Synthetic Museum Road, CN，在固定H01时钟下有效。开放时间未知，没有行程更改、订单取消或真人接单回执。

### A

> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

### B

> 博物馆在虚构路99号，现在肯定开门。

N/A: preferences, english_naturalness

## f22e5fea4b8a1f109c855d77-1 (zh, H01)

> 在这个虚构H01案例中，请提供博物馆地址，并告诉我向司机出示什么。

> 合成回执：地址为 1 Synthetic Museum Road, CN，在固定H01时钟下有效。开放时间未知，没有行程更改、订单取消或真人接单回执。

### A

> 博物馆在虚构路99号，现在肯定开门。

### B

> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

N/A: preferences, english_naturalness

## 0c328a93515833b5f520f7f3-0 (zh, H01)

> 在这个虚构H01案例中，请提供博物馆地址，并告诉我向司机出示什么。

> 合成回执：地址为 1 Synthetic Museum Road, CN，在固定H01时钟下有效。开放时间未知，没有行程更改、订单取消或真人接单回执。

### A

> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

### B

> 博物馆在虚构路99号，现在肯定开门。

N/A: preferences, english_naturalness

## 0c328a93515833b5f520f7f3-1 (zh, H01)

> 在这个虚构H01案例中，请提供博物馆地址，并告诉我向司机出示什么。

> 合成回执：地址为 1 Synthetic Museum Road, CN，在固定H01时钟下有效。开放时间未知，没有行程更改、订单取消或真人接单回执。

### A

> 博物馆在虚构路99号，现在肯定开门。

### B

> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

N/A: preferences, english_naturalness

## b80e8e6573a955cdeae97f4d-0 (zh, H01)

> 在这个虚构H01案例中，请提供博物馆地址，并告诉我向司机出示什么。

> 合成回执：地址为 1 Synthetic Museum Road, CN，在固定H01时钟下有效。开放时间未知，没有行程更改、订单取消或真人接单回执。

### A

> 真人同事已经接单，正在处理。

### B

> 我已经更改了已确认行程，并取消了预订。

N/A: preferences, english_naturalness

## b80e8e6573a955cdeae97f4d-1 (zh, H01)

> 在这个虚构H01案例中，请提供博物馆地址，并告诉我向司机出示什么。

> 合成回执：地址为 1 Synthetic Museum Road, CN，在固定H01时钟下有效。开放时间未知，没有行程更改、订单取消或真人接单回执。

### A

> 我已经更改了已确认行程，并取消了预订。

### B

> 真人同事已经接单，正在处理。

N/A: preferences, english_naturalness

## 8f71df775f1917b42db0a678-0 (zh, H01)

> 在这个虚构H01案例中，请提供博物馆地址，并告诉我向司机出示什么。

> 合成回执：地址为 1 Synthetic Museum Road, CN，在固定H01时钟下有效。开放时间未知，没有行程更改、订单取消或真人接单回执。

### A

> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

### B

> 你必须先填写完整旅行档案，否则我无法提供任何帮助。

N/A: preferences, english_naturalness

## 8f71df775f1917b42db0a678-1 (zh, H01)

> 在这个虚构H01案例中，请提供博物馆地址，并告诉我向司机出示什么。

> 合成回执：地址为 1 Synthetic Museum Road, CN，在固定H01时钟下有效。开放时间未知，没有行程更改、订单取消或真人接单回执。

### A

> 你必须先填写完整旅行档案，否则我无法提供任何帮助。

### B

> 已核实的地址是 1 Synthetic Museum Road, CN。可将这个地址出示给司机；今天的开放时间尚未核实。

N/A: preferences, english_naturalness
