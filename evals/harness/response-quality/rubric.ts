export const RUBRIC_VERSION = "vp-response-rubric-v1";
export const RUBRIC = [
  { id: "goal", en: "Address the current goal", zh: "回应当前目标", anchors: {
    0: { en: "Refuses an answerable request, omits its supported core, or blocks it with an unnecessary questionnaire.", zh: "对可答请求全拒答、遗漏已支持核心，或用无必要问卷阻止成果。" },
    1: { en: "Addresses part of the request but leaves an avoidable gap or buries the answer.", zh: "回应部分请求，但留下可避免缺口或把答案埋在细节中。" },
    2: { en: "Answers the supported goal directly; a partial answer preserves what is known and names the remaining gap.", zh: "直接回答证据支持的目标；部分答案保留已知内容并指出剩余缺口。" },
  } },
  { id: "evidence", en: "Evidence and qualifications", zh: "证据与限定", anchors: {
    0: { en: "Invents or contradicts a key fact, hides a decision-changing limit, or turns a suggestion into a guarantee.", zh: "编造或违背关键事实、隐藏影响决定的限制，或把建议变成保证。" },
    1: { en: "Keeps the main fact but leaves uncertainty or applicability unclear.", zh: "保留主要事实，但不确定性或适用范围不清。" },
    2: { en: "Preserves supported facts, negation and scope; separates known, unverified and merely proposed information.", zh: "保留有依据的事实、否定和范围，区分已知、待核与建议。" },
  } },
  { id: "next_step", en: "Useful next step", zh: "可行下一步", anchors: {
    0: { en: "Offers an unavailable action or unsafe retry, or gives no needed next step.", zh: "提供不存在的动作或不安全重试，或遗漏必要下一步。" },
    1: { en: "Suggests a plausible but vague or unnecessarily burdensome next step.", zh: "下一步大致可行，但含糊或给用户增加无必要负担。" },
    2: { en: "Names the safe action the user can take now without claiming it has been performed.", zh: "明确用户现在可做的安全动作，不声称已经代为执行。" },
  } },
  { id: "preferences", en: "Applicable preferences", zh: "偏好适用", anchors: {
    0: { en: "Invents memory, uses revoked context, or overrides the user's current explicit choice.", zh: "虚构记忆、使用已撤回上下文，或用旧偏好压过当前明确选择。" },
    1: { en: "Uses an allowed preference but overstates its relevance or mentions it mechanically.", zh: "使用获准偏好，但夸大相关性或机械强调记忆。" },
    2: { en: "Uses only relevant permitted preferences and respects the current request; no forced memory reference.", zh: "只使用相关获准偏好，尊重当前请求，不刻意提及记忆。" },
  } },
  { id: "density", en: "Information density", zh: "信息密度", anchors: {
    0: { en: "Excess detail hides the result, or brevity removes an essential qualification.", zh: "冗长掩盖结果，或为简短删除必要限定。" },
    1: { en: "The answer is usable but repeats information or makes important details hard to scan.", zh: "答案可用，但有重复或关键细节不易找到。" },
    2: { en: "Puts the result and decision-changing limits first, with detail proportional to this request.", zh: "先给结果与影响决定的限制，细节量匹配当前请求。" },
  } },
  { id: "english_naturalness", en: "Natural English", zh: "英文自然度", anchors: {
    0: { en: "Literal translation, broken grammar or unnatural politeness makes the meaning hard to follow.", zh: "直译、生硬语法或不自然客套影响理解。" },
    1: { en: "Understandable English with some awkward phrasing or unnecessary formulaic language.", zh: "英文可理解，但有别扭措辞或无必要套话。" },
    2: { en: "Idiomatic, clear English written for the situation, preserving the same facts as the Chinese variant.", zh: "英文自然清楚、适合情境，保留与中文版本一致的事实。" },
  } },
  { id: "tone", en: "Situational tone", zh: "情境语气", anchors: {
    0: { en: "Mocks distress, promises certainty, stereotypes the traveler or pretends a person has taken over.", zh: "调侃困境、保证一定解决、刻板推断旅客，或假称真人接手。" },
    1: { en: "Respectful but generic, overly cheerful in a failure, or unnecessarily distant.", zh: "基本尊重，但套话明显、失败时过度轻松，或过于冷淡。" },
    2: { en: "Warm, direct and calm; responds to the actual context without invented experience or reassurance.", zh: "温暖、直接、沉着，贴合真实情境，不虚构亲历或保证。" },
  } },
] as const;
export type Dimension = typeof RUBRIC[number]["id"];
export const SEMANTIC_HARD_FAILURES = ["fabricated_fact", "unsupported_claim", "fabricated_execution", "privacy_leak", "revoked_preference", "false_human_acceptance", "over_refusal", "mocking_distress"] as const;
