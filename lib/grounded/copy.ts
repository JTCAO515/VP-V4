import type { SavedTurn } from "./read-model.ts";

export const savedAnswerCopy = {
  en: {
    title: "Your saved answers", description: "Read questions saved in the app, with their original language and sources.",
    refresh: "Refresh answers", checking: "Checking access and sources…", unavailable: "Saved answers are unavailable. Please sign in again or try later.",
    empty: "No saved answers are available.", sources: "Sources and context", conditions: "Applies when", exclusions: "Does not cover",
    pending: "This question is still being processed.", cancelled: "This question was cancelled.", clarification: "More detail is needed. Continue this question in the app.",
    partial: "The information below covers only supported points about booking ID and ticket proof. Other parts of your question remain unanswered. Check current railway or station guidance for the missing details.",
    blocked: "There is no supported answer available for this question. Check current railway or station guidance for the information you need.", failed: "This question could not be completed. Continue in the app.",
    parent: "Follow-up question", original: "Original question", cities: { shanghai: "Shanghai", beijing: "Beijing", guangzhou: "Guangzhou", chongqing: "Chongqing" },
  },
  zh: {
    title: "已保存的回答", description: "查看在 App 中保存的问题，保留原始语言和来源。",
    refresh: "刷新回答", checking: "正在核对访问权限和来源…", unavailable: "暂时无法读取已保存的回答，请重新登录或稍后再试。",
    empty: "暂无可读取的已保存回答。", sources: "来源与上下文", conditions: "适用条件", exclusions: "不包含",
    pending: "这个问题仍在处理中。", cancelled: "这个问题已取消。", clarification: "还需要更多信息，请在 App 中继续这个问题。",
    partial: "以下信息只涵盖购票身份证件和车票凭证中有依据的要点，你的问题中其他部分尚未回答。请查看铁路官方渠道或车站的当前指引，核对缺少的信息。",
    blocked: "目前没有可用的、有依据的回答。请查看铁路官方渠道或车站的当前指引，核对你需要的信息。", failed: "这个问题未能完成，请在 App 中继续。",
    parent: "后续问题", original: "原始问题", cities: { shanghai: "上海", beijing: "北京", guangzhou: "广州", chongqing: "重庆" },
  },
} as const;

/** Queue terminal states can precede any grounded result; they are never ongoing work. */
export function savedAnswerNotice(turn: SavedTurn): "pending" | "cancelled" | "failed" | "blocked" | "clarification" | "partial" | null {
  if (turn.projection === "pending") return turn.status === "cancelled" ? "cancelled" : turn.status === "failed" ? "failed" : "pending";
  if (turn.projection === "unavailable") return "blocked";
  if (turn.outcome === "clarification") return "clarification";
  if (turn.outcome === "technical_failure") return "failed";
  if (turn.outcome === "blocked" || !turn.facts.length) return "blocked";
  return turn.outcome === "partial" || turn.coverage === "partial" ? "partial" : null;
}
