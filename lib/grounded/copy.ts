export const savedAnswerCopy = {
  en: {
    title: "Your saved answers", description: "Read questions saved in the app, with their original language and sources.",
    refresh: "Refresh answers", checking: "Checking access and sources…", unavailable: "Saved answers are unavailable. Please sign in again or try later.",
    empty: "No saved answers are available.", sources: "Sources and context", conditions: "Applies when", exclusions: "Does not cover",
    pending: "This question is still being processed.", clarification: "More detail is needed. Continue this question in the app.",
    partial: "Only part of this question has supported information. The sources below do not cover every need.",
    blocked: "There is no supported answer available for this question.", failed: "This question could not be completed. Continue in the app.",
    parent: "Follow-up question", original: "Original question", cities: { shanghai: "Shanghai", beijing: "Beijing", guangzhou: "Guangzhou", chongqing: "Chongqing" },
  },
  zh: {
    title: "已保存的回答", description: "查看在 App 中保存的问题，保留原始语言和来源。",
    refresh: "刷新回答", checking: "正在核对访问权限和来源…", unavailable: "暂时无法读取已保存的回答，请重新登录或稍后再试。",
    empty: "暂无可读取的已保存回答。", sources: "来源与上下文", conditions: "适用条件", exclusions: "不包含",
    pending: "这个问题仍在处理中。", clarification: "还需要更多信息，请在 App 中继续这个问题。",
    partial: "只有部分问题有依据支持，以下来源未覆盖所有需求。",
    blocked: "目前没有可用的、有依据的回答。", failed: "这个问题未能完成，请在 App 中继续。",
    parent: "后续问题", original: "原始问题", cities: { shanghai: "上海", beijing: "北京", guangzhou: "广州", chongqing: "重庆" },
  },
} as const;
