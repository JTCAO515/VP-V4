import type { Confidence, FactState, Localized } from "./types";

export type MemorySource = "chat" | "canvas" | "saved" | "upload" | "setting" | "past";

export type MemoryItem = {
  id: string;
  dimension: Localized;
  /** How the value is shown: a bar, a range, tags, or a hard constraint badge. */
  render: "bar" | "range" | "tags" | "hard" | "time";
  value: Localized;
  /** 0-100, only used by `bar` and `range`. */
  fill?: number;
  state: FactState;
  confidence: Confidence;
  source: MemorySource;
  sourceDetail: Localized;
  updated: Localized;
  /** Which suggestions this item has already rewritten. */
  impact: Localized[];
  /** Hard constraints cannot be overridden automatically anywhere in the demo. */
  hard?: boolean;
};

export const MEMORY: MemoryItem[] = [
  {
    id: "m-pace", dimension: { en: "Travel intensity", zh: "旅行强度" }, render: "bar", fill: 68,
    value: { en: "Relaxed · about two main stops a day", zh: "舒适 · 每天约两个主要节点" },
    state: "confirmed", confidence: "high", source: "canvas",
    sourceDetail: { en: "You confirmed three Canvas changes that removed stops", zh: "你确认过三次删减节点的 Canvas 改动" },
    updated: { en: "2d ago", zh: "2 天前" },
    impact: [{ en: "Shanghai Day 2 lost one architecture stop", zh: "上海 Day 2 删掉一个建筑点位" }, { en: "Xi'an Day 2 kept a single main sight", zh: "西安 Day 2 只保留一个主要景点" }],
  },
  {
    id: "m-budget", dimension: { en: "Daily budget", zh: "每日预算" }, render: "range", fill: 74,
    value: { en: "USD 180–260, excluding intercity transport", zh: "USD 180–260，不含跨城交通" },
    state: "confirmed", confidence: "high", source: "setting",
    sourceDetail: { en: "You set it directly in Travel Profile", zh: "你在旅行画像中直接设置" },
    updated: { en: "5d ago", zh: "5 天前" },
    impact: [{ en: "Beijing hotel flagged as above band", zh: "北京酒店被标为超出区间" }, { en: "Budget chat rebalanced three nodes", zh: "预算对话重排了三个节点" }],
  },
  {
    id: "m-walk", dimension: { en: "Walking", zh: "步行强度" }, render: "bar", fill: 62,
    value: { en: "7,000–9,000 steps a day", zh: "每天 7,000–9,000 步" },
    state: "confirmed", confidence: "high", source: "past",
    sourceDetail: { en: "Averaged across your two previous trips", zh: "取自你此前两次旅行的平均值" },
    updated: { en: "5d ago", zh: "5 天前" },
    impact: [{ en: "Day 2 walking cut by 2.4 km", zh: "Day 2 步行减少 2.4 km" }, { en: "Metro swap approved in the budget chat", zh: "预算对话里通过了地铁替换" }],
  },
  {
    id: "m-time", dimension: { en: "Start time", zh: "出发时间" }, render: "time",
    value: { en: "Around 09:00, no early call times", zh: "09:00 左右，不安排过早集合" },
    state: "confirmed", confidence: "high", source: "chat",
    sourceDetail: { en: "You rejected two 07:00 starts", zh: "你拒绝过两次 07:00 出发" },
    updated: { en: "1d ago", zh: "1 天前" },
    impact: [{ en: "Warriors moved to the 13:00 slot", zh: "兵马俑改到 13:00 场次" }],
  },
  {
    id: "m-hotel", dimension: { en: "Hotels", zh: "酒店" }, render: "tags",
    value: { en: "4-star or boutique · quiet · breakfast · cancellable", zh: "四星或精品 · 安静 · 含早 · 可取消" },
    state: "confirmed", confidence: "medium", source: "chat",
    sourceDetail: { en: "Stated in the Beijing hotel chat", zh: "在北京酒店对话中说明" },
    updated: { en: "2d ago", zh: "2 天前" },
    impact: [{ en: "Street-side suite ranked last", zh: "临街套房排在最后" }],
  },
  {
    id: "m-transport", dimension: { en: "Transport", zh: "交通" }, render: "tags",
    value: { en: "Rail between cities · short rides in-city", zh: "城际优先高铁 · 市内接受短途叫车" },
    state: "confirmed", confidence: "high", source: "chat",
    sourceDetail: { en: "You chose rail over air in the transport chat", zh: "你在交通对话里选择高铁而非航班" },
    updated: { en: "2d ago", zh: "2 天前" },
    impact: [{ en: "Rail marked as the profile match", zh: "高铁被标为画像匹配项" }, { en: "A 12-minute ride added on Day 2", zh: "Day 2 加入一次 12 分钟叫车" }],
  },
  {
    id: "m-interest", dimension: { en: "Interests", zh: "兴趣" }, render: "tags",
    value: { en: "Architecture · history · local food · museums", zh: "建筑 · 历史 · 本地美食 · 博物馆" },
    state: "inferred", confidence: "medium", source: "saved",
    sourceDetail: { en: "Inferred from 4 saved places and 2 rejections", zh: "从 4 个收藏地点和 2 次拒绝推断" },
    updated: { en: "1d ago", zh: "1 天前" },
    impact: [{ en: "Kept the higher-rated museum in the budget chat", zh: "预算对话里保留了评价更高的展馆" }],
  },
  {
    id: "m-allergy", dimension: { en: "Allergy", zh: "过敏" }, render: "hard", hard: true,
    value: { en: "Peanut", zh: "花生" },
    state: "confirmed", confidence: "high", source: "setting",
    sourceDetail: { en: "You entered it in Travel Profile", zh: "你在旅行画像中填写" },
    updated: { en: "5d ago", zh: "5 天前" },
    impact: [{ en: "Day 2 dinner switched to a peanut-free menu", zh: "Day 2 晚餐改为无花生菜单" }, { en: "Xi'an food street lunch flagged", zh: "西安回民街午餐被标注" }, { en: "Menu recognition flags 4 dishes", zh: "菜单识别标出 4 道菜" }],
  },
  {
    id: "m-access", dimension: { en: "Step-free access", zh: "无障碍通行" }, render: "hard", hard: true,
    value: { en: "Needed when parents travel with you", zh: "父母同行时需要" },
    state: "confirmed", confidence: "high", source: "chat",
    sourceDetail: { en: "Stated in the travelling-with-parents chat", zh: "在带父母同行的对话中说明" },
    updated: { en: "6h ago", zh: "6 小时前" },
    impact: [{ en: "Stair-only platform replaced", zh: "只有台阶的观景平台被替换" }],
  },
  {
    id: "m-risk", dimension: { en: "Risk appetite", zh: "风险偏好" }, render: "bar", fill: 34,
    value: { en: "Cautious · values cancellation and official channels", zh: "谨慎 · 重视取消政策与官方渠道" },
    state: "inferred", confidence: "medium", source: "chat",
    sourceDetail: { en: "You asked for cancellation terms in three chats", zh: "你在三次对话中都问了取消政策" },
    updated: { en: "1d ago", zh: "1 天前" },
    impact: [{ en: "Flexible-cancel hotels ranked first", zh: "可灵活取消的酒店排在最前" }],
  },
  {
    id: "m-payment", dimension: { en: "Payment", zh: "支付" }, render: "tags",
    value: { en: "International card first · mobile pay and cash as backup", zh: "优先境外信用卡 · 移动支付与现金备用" },
    state: "inferred", confidence: "recheck", source: "chat",
    sourceDetail: { en: "Inferred from the arrival-day chat; binding rules unverified", zh: "从落地首日对话推断；绑卡规则未经核实" },
    updated: { en: "5h ago", zh: "5 小时前" },
    impact: [{ en: "Card binding marked Recheck on the arrival Canvas", zh: "落地 Canvas 上把绑卡标为需复核" }],
  },
  {
    id: "m-companions", dimension: { en: "Companions", zh: "同行人" }, render: "tags",
    value: { en: "Solo, or with two parents", zh: "独自出行，或与两位父母同行" },
    state: "confirmed", confidence: "high", source: "chat",
    sourceDetail: { en: "Stated in the travelling-with-parents chat", zh: "在带父母同行的对话中说明" },
    updated: { en: "6h ago", zh: "6 小时前" },
    impact: [{ en: "Day 1 rebuilt at a slower pace", zh: "Day 1 按更慢的节奏重建" }],
  },
];

/** The before/after preview shown when you open a memory-driven Canvas change. */
export const MEMORY_PREVIEW = {
  title: { en: "Day 2, before and after", zh: "Day 2 的改动前后" },
  before: [
    { en: "Wukang Road · 1 h 15 m", zh: "武康路 · 1 小时 15 分" },
    { en: "Second architecture stop · 1 h", zh: "第二个建筑点位 · 1 小时" },
    { en: "Café · 50 min", zh: "咖啡馆 · 50 分钟" },
    { en: "Fine-dining dinner · peanut in two dishes", zh: "精品晚餐 · 两道菜含花生" },
  ],
  after: [
    { en: "Wukang Road · 1 h 15 m", zh: "武康路 · 1 小时 15 分" },
    { en: "Short ride · 12 min", zh: "短途叫车 · 12 分钟" },
    { en: "Café · 50 min", zh: "咖啡馆 · 50 分钟" },
    { en: "Peanut-free set dinner", zh: "无花生套餐晚餐" },
  ],
  deltas: [
    { label: { en: "Walking", zh: "步行" }, from: "9.2 km", to: "6.8 km" },
    { label: { en: "Budget", zh: "预算" }, from: "¥1,180", to: "¥940" },
    { label: { en: "Main stops", zh: "主要节点" }, from: "5", to: "4" },
  ],
};

export const MEMORY_EXPORT = `{
  "profileId": "VP-US-1048",
  "generated": "demo fixture",
  "items": [
    { "id": "m-budget", "value": "USD 180-260/day", "state": "confirmed" },
    { "id": "m-walk",   "value": "7000-9000 steps", "state": "confirmed" },
    { "id": "m-allergy","value": "peanut", "state": "confirmed", "hard": true }
  ]
}`;
