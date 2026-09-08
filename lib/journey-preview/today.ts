import type { Evidence, Localized } from "./types";

export type CheckVerdict = "pass" | "warn" | "fail";

export type SimCheck = {
  id: string;
  label: Localized;
  verdict: CheckVerdict;
  detail: Localized;
  evidence?: Evidence[];
  alternatives?: Localized[];
};

/** The nine checks from the plan, section 8.1. */
export const SIM_CHECKS: SimCheck[] = [
  { id: "route", label: { en: "Route feasibility", zh: "路线可行性" }, verdict: "pass", detail: { en: "The planned route connects each stop.", zh: "按当前路线，相邻地点之间都能顺利到达。" } },
  { id: "transfer", label: { en: "Transfer time", zh: "转场时间" }, verdict: "warn", detail: { en: "Day 2 leaves 8 minutes of buffer between the café and dinner.", zh: "Day 2 咖啡馆到晚餐之间只剩 8 分钟缓冲。" }, alternatives: [{ en: "Shorten the café stop by 15 minutes", zh: "咖啡馆缩短 15 分钟" }, { en: "Move dinner 20 minutes later", zh: "晚餐后移 20 分钟" }] },
  { id: "last", label: { en: "First and last departures", zh: "首末班" }, verdict: "fail", detail: { en: "The Shanghai → Xi'an leg departs before your dinner ends.", zh: "上海 → 西安 这段的末班车早于你的晚餐结束时间。" }, evidence: [{ kind: "official", label: { en: "Rail official channel", zh: "铁路官方渠道" }, checked: { en: "Demo recheck: 2d ago", zh: "Demo 复核：2 天前" } }], alternatives: [{ en: "Move the leg to the next morning", zh: "这段改到次日上午" }, { en: "Move dinner two hours earlier", zh: "晚餐提前两小时" }] },
  { id: "hours", label: { en: "Opening hours and closed days", zh: "开放时间与闭馆日" }, verdict: "warn", detail: { en: "The museum's last entry is earlier than its closing time.", zh: "美术馆的最后入场早于闭馆时间。" }, alternatives: [{ en: "Arrive 45 minutes earlier", zh: "提前 45 分钟到" }, { en: "Move it to the free morning", zh: "改到空着的上午" }] },
  { id: "booking", label: { en: "Booking status", zh: "预订状态" }, verdict: "fail", detail: { en: "Two nodes need a timed reservation and neither is held.", zh: "两个节点需要预约时段，都还没有落实。" }, alternatives: [{ en: "Open both official channels now", zh: "现在打开两个官方渠道" }, { en: "Swap to nodes that need no reservation", zh: "换成无需预约的节点" }] },
  { id: "crowd", label: { en: "Queues and crowding", zh: "排队与人流" }, verdict: "warn", detail: { en: "Two stops fall inside the busiest window of the day.", zh: "两个节点落在一天中最拥挤的时段。" }, alternatives: [{ en: "Shift both 90 minutes earlier", zh: "两处都提前 90 分钟" }, { en: "Accept the queue and cut one stop", zh: "接受排队并删掉一个节点" }] },
  { id: "weather", label: { en: "Weather sensitivity", zh: "天气敏感度" }, verdict: "pass", detail: { en: "Outdoor stops are spread across days rather than stacked.", zh: "户外节点分散在不同天，没有堆在一起。" } },
  { id: "budget", label: { en: "Budget", zh: "预算" }, verdict: "warn", detail: { en: "Day 2 is ¥140 above your usual daily band.", zh: "Day 2 比你的常规每日区间高 ¥140。" }, alternatives: [{ en: "Swap dinner to the mid-range set", zh: "晚餐换成中档套餐" }, { en: "Accept it and rebalance Day 3", zh: "接受并在 Day 3 找补" }] },
  { id: "hard", label: { en: "Hard constraints", zh: "硬约束" }, verdict: "pass", detail: { en: "No node conflicts with the peanut allergy or step-free requirement.", zh: "没有节点与花生过敏或无障碍要求冲突。" } },
];

export const TODAY = {
  next: {
    title: { en: "Wukang Road, on foot", zh: "步行前往武康路" },
    leaveAt: { en: "09:20", zh: "09:20" },
    transfer: { en: "Metro line change once · 21 min", zh: "地铁换乘一次 · 21 分钟" },
    bring: { en: "Passport · bilingual address card · allergy card", zh: "护照 · 中英文地址卡 · 过敏说明卡" },
  },
  conditions: [
    { label: { en: "Weather", zh: "天气" }, value: { en: "Overcast, 24°C", zh: "多云，24°C" } },
    { label: { en: "Air quality", zh: "空气质量" }, value: { en: "Moderate", zh: "中等" } },
    { label: { en: "Alerts", zh: "预警" }, value: { en: "None active", zh: "暂无" } },
    { label: { en: "Closed today", zh: "今日闭馆" }, value: { en: "One saved place is closed", zh: "一个收藏地点今日闭馆" } },
  ],
  recovery: [
    { id: "delay", title: { en: "Transport is delayed", zh: "交通延误" }, body: { en: "Drop the museum, keep dinner by moving it to 20:00.", zh: "取消美术馆，晚餐改到 20:00 保留。" } },
    { id: "closed", title: { en: "A place is closed", zh: "地点闭馆" }, body: { en: "Swap in the riverside stretch, which needs no ticket.", zh: "换成无需门票的滨江段。" } },
    { id: "queue", title: { en: "The queue is too long", zh: "排队太久" }, body: { en: "Move to the second restaurant on your shortlist, 400 m away.", zh: "换到备选里的第二家餐厅，相距 400 米。" } },
    { id: "unwell", title: { en: "Someone feels unwell", zh: "身体不适" }, body: { en: "Cut the afternoon to one indoor stop and surface the medical channel.", zh: "下午缩减为一个室内节点，并给出医疗渠道。" } },
  ],
  note: {
    en: "Recovery plans are added to the diff first. The Canvas changes only after you approve them.",
    zh: "应变方案会先进入 Diff。确认之后，Canvas 才会修改。",
  } as Localized,
};
