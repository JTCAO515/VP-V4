import type { SavedTurn } from "./read-model.ts";

export const savedAnswerCopy = {
  en: {
    unanswered: "Not answered by this guidance", outsideScope: "The current reviewed guidance does not cover these parts of your question. Check them with the relevant official or service provider.",
    title: "Your saved answers", description: "Read questions saved in the app, with their original language and sources.",
    refresh: "Refresh answers", checking: "Checking access and sources…", unavailable: "Saved answers are unavailable. Please sign in again or try later.",
    empty: "No saved answers are available.", sources: "Sources and context", conditions: "Applies when", exclusions: "Does not cover",
    pending: "This question is still being processed.", cancelled: "This question was cancelled.", clarification: "More detail is needed. Continue this question in the app.",
    placeClarification: "More than one reviewed attraction matches this name. Please provide its full official name and check the selected city in the app.",
    placeBlocked: "Current reviewed information does not support the requested attraction details. Check the full venue name, selected city and the venue's official information.",
    placePartial: "Reviewed attraction details are shown below. Other requested details remain unanswered; check them with the venue.",
    placeHoursMissing: "The supported details are shown below, but today's opening time is not verified. Check the venue's current official opening information before visiting.",
    placeAddressMissing: "The supported details are shown below, but the address is not verified. Confirm the address with the venue before travelling.",
    connectivityPartial: "The supported SIM guidance is shown below. Other requested details remain unanswered. Check the missing information with your mobile carrier before applying or choosing a plan.",
    connectivityBlocked: "There is no supported SIM answer available for this question. Check the current application requirements or plan details with your mobile carrier.",
    paymentPartial: "The supported payment guidance is shown below. Other requested details remain unanswered. Check current app prompts, your card issuer or the relevant operator for the missing information.",
    paymentBlocked: "There is no supported payment answer available for this question. Check current app prompts, your card issuer or the relevant operator for the information you need.",
    partial: "The information below covers only supported points about booking ID and ticket proof. Other parts of your question remain unanswered. Check current railway or station guidance for the missing details.",
    blocked: "There is no supported answer available for this question. Check the relevant official or service provider guidance for the information you need.", failed: "This question could not be completed. Continue in the app.",
    parent: "Follow-up question", original: "Original question", cities: { shanghai: "Shanghai", beijing: "Beijing", guangzhou: "Guangzhou", chongqing: "Chongqing" },
    aiAssistPrompt: "Search further with AI (unreviewed)", aiAssistLoading: "Searching further…", aiAssistRetry: "Try again",
    aiAssistDisclaimer: "AI-generated from published guidance, not reviewed like the answer above. Verify before relying on it.",
    aiAssistGaps: "Not covered by this search", aiAssistConflicts: "Search results disagreed",
    aiAssistMissingContent: "No published guidance exists yet for this topic.", aiAssistRetrievalMiss: "The AI search did not find anything relevant in published guidance.",
    aiAssistUserInputMissing: "More detail is needed before an AI search can run. Continue this question in the app.",
    aiAssistCapabilityUnsupported: "AI search does not cover this kind of question yet.", aiAssistPolicyDenied: "AI search is not available for this question.",
    aiAssistProviderFailure: "AI search could not complete right now.", aiAssistBudgetExhausted: "AI search ran out of time without finding a clear answer.",
    aiAssistCancelled: "AI search was cancelled.", aiAssistNotOffered: "AI search is not available for this question.", aiAssistUnavailable: "AI search is unavailable right now.",
  },
  zh: {
    unanswered: "本次指引尚未回答", outsideScope: "当前已审核指引不涵盖你所问的以下内容，请向相关官方渠道或服务方核对。",
    title: "已保存的回答", description: "查看在 App 中保存的问题，保留原始语言和来源。",
    refresh: "刷新回答", checking: "正在核对访问权限和来源…", unavailable: "暂时无法读取已保存的回答，请重新登录或稍后再试。",
    empty: "暂无可读取的已保存回答。", sources: "来源与上下文", conditions: "适用条件", exclusions: "不包含",
    pending: "这个问题仍在处理中。", cancelled: "这个问题已取消。", clarification: "还需要更多信息，请在 App 中继续这个问题。",
    placeClarification: "这个名称匹配到多个已审核景点。请在 App 中提供完整官方名称，并核对所选城市。",
    placeBlocked: "当前已审核信息不足以支持所问的景点详情。请核对场馆完整名称、所选城市及场馆官方信息。",
    placePartial: "以下是有依据的景点信息，其他所问内容尚未回答，请向场馆核对。",
    placeHoursMissing: "以下是有依据的信息，但今天的开放时间尚未核实。到访前请查看场馆当前的官方开放信息。",
    placeAddressMissing: "以下是有依据的信息，但地址尚未核实。出发前请向场馆确认地址。",
    connectivityPartial: "以下是有依据的SIM卡指引，其他所问信息尚未回答。办理或选择套餐前，请向通信运营商核对缺少的信息。",
    connectivityBlocked: "目前没有可用的、有依据的SIM卡回答。请向通信运营商核对当前申请要求或套餐细节。",
    paymentPartial: "以下是有依据的支付指引，其他所问信息尚未回答。请查看应用当前提示，或向发卡行及相关经营方核对缺少的信息。",
    paymentBlocked: "目前没有可用的、有依据的支付回答。请查看应用当前提示，或向发卡行及相关经营方核对所需信息。",
    partial: "以下信息只涵盖购票身份证件和车票凭证中有依据的要点，你的问题中其他部分尚未回答。请查看铁路官方渠道或车站的当前指引，核对缺少的信息。",
    blocked: "目前没有可用的、有依据的回答。请向相关官方渠道或服务方核对所需信息。", failed: "这个问题未能完成，请在 App 中继续。",
    parent: "后续问题", original: "原始问题", cities: { shanghai: "上海", beijing: "北京", guangzhou: "广州", chongqing: "重庆" },
    aiAssistPrompt: "用 AI 深度搜索（未经审核）", aiAssistLoading: "正在深入搜索…", aiAssistRetry: "重试",
    aiAssistDisclaimer: "此内容由 AI 从已发布指引中检索生成，未经过人工审核，请在使用前自行核实。",
    aiAssistGaps: "本次搜索未涵盖", aiAssistConflicts: "搜索结果存在分歧",
    aiAssistMissingContent: "目前还没有相关的已发布指引。", aiAssistRetrievalMiss: "AI 搜索未在已发布指引中找到相关内容。",
    aiAssistUserInputMissing: "需要更多信息才能进行 AI 搜索，请在 App 中继续这个问题。",
    aiAssistCapabilityUnsupported: "AI 搜索暂不支持这类问题。", aiAssistPolicyDenied: "此问题暂不支持 AI 搜索。",
    aiAssistProviderFailure: "AI 搜索目前无法完成。", aiAssistBudgetExhausted: "AI 搜索未能在限定轮次内找到明确答案。",
    aiAssistCancelled: "AI 搜索已取消。", aiAssistNotOffered: "此问题暂不支持 AI 搜索。", aiAssistUnavailable: "AI 搜索暂时不可用。",
  },
} as const;

/** Queue terminal states can precede any grounded result; they are never ongoing work. */
export function savedAnswerNotice(turn: SavedTurn): "pending" | "cancelled" | "failed" | "blocked" | "clarification" | "partial" | "paymentPartial" | "paymentBlocked" | "connectivityPartial" | "connectivityBlocked" | "placeClarification" | "placeBlocked" | "placePartial" | "placeHoursMissing" | "placeAddressMissing" | null {
  const payment = turn.questionId?.startsWith("payment_") === true;
  const connectivity = turn.questionId?.startsWith("connectivity_") === true;
  const place = turn.questionId?.startsWith("place_") === true || turn.placeResolution !== undefined;
  if (turn.projection === "pending") return turn.status === "cancelled" ? "cancelled" : turn.status === "failed" ? "failed" : "pending";
  if (turn.projection === "unavailable") return place ? "placeBlocked" : connectivity ? "connectivityBlocked" : payment ? "paymentBlocked" : "blocked";
  if (turn.outcome === "clarification") return turn.placeResolution === "ambiguous" ? "placeClarification" : "clarification";
  if (turn.outcome === "technical_failure") return "failed";
  if (turn.outcome === "blocked" || !turn.facts.length) return place ? "placeBlocked" : connectivity ? "connectivityBlocked" : payment ? "paymentBlocked" : "blocked";
  if (place && (turn.outcome === "partial" || turn.coverage === "partial")) return turn.missingClaims?.includes("opening_hours") ? "placeHoursMissing" : turn.missingClaims?.includes("place_address") ? "placeAddressMissing" : "placePartial";
  return turn.outcome === "partial" || turn.coverage === "partial" ? connectivity ? "connectivityPartial" : payment ? "paymentPartial" : "partial" : null;
}

/** Labels for validated server-owned obligations; never model-authored explanations. */
export const savedClaimGapCopy = {
  en: {
    title: "Points without current support",
    claims: {
      original_valid_booking_id: "Original identity document used for booking",
      valid_ticket_not_itinerary_or_receipt: "Itinerary and receipt as ticket proof",
      merchant_acceptance_check: "Checking card acceptance",
      supported_card_merchant_qr_payment: "Mobile merchant payments",
      international_card_atm_withdrawal: "RMB cash from an ATM",
      marked_currency_exchange: "Currency-exchange outlets",
      passport_or_foreign_permanent_resident_id: "SIM application documents",
      plan_allowance_check: "Checking call and data allowances",
      place_address: "Attraction address",
      opening_hours: "Today’s opening time",
    },
    reasons: {
      missing: "No published support was found for this point.",
      expired: "The supporting publication has expired.",
      revoked: "The supporting publication has been withdrawn.",
      unreviewed: "The publication is not currently reviewed.",
      unresolved_variants: "Reviewed versions differ and have not been reconciled.",
      not_current_date: "The published opening window is for another date; today’s hours are unverified.",
    },
  },
  zh: {
    title: "尚缺当前依据的要点",
    claims: {
      original_valid_booking_id: "购票证件",
      valid_ticket_not_itinerary_or_receipt: "行程单和报销凭证是否可作车票",
      merchant_acceptance_check: "核对外卡受理",
      supported_card_merchant_qr_payment: "手机商户支付",
      international_card_atm_withdrawal: "ATM取人民币现金",
      marked_currency_exchange: "外币兑换网点",
      passport_or_foreign_permanent_resident_id: "SIM卡申请证件",
      plan_allowance_check: "核对通话和流量额度",
      place_address: "景点地址",
      opening_hours: "今日开放时间",
    },
    reasons: {
      missing: "尚未找到支持这一要点的已发布信息。",
      expired: "相关依据已超过有效期。",
      revoked: "相关依据已撤回。",
      unreviewed: "相关发布内容当前不满足审核条件。",
      unresolved_variants: "已审核版本存在差异，尚未完成核对。",
      not_current_date: "已发布开放时段对应其他日期，今日开放时间尚未核实。",
    },
  },
} as const;
