import type { ChatId, Localized } from "./types";

export type DemoSurface = "today" | "ask" | "copilot" | "tools" | "explore" | "user";

/** Capability cards shown on the marketing page; each one opens the demo where it lives. */
export type Feature = {
  id: string;
  glyph: string;
  title: Localized;
  body: Localized;
  proof: Localized;
  surface: DemoSurface;
  chatId?: ChatId;
};

export const FEATURES: Feature[] = [
  {
    id: "diff",
    glyph: "diff",
    title: { en: "Changes wait for your approval", zh: "改行程前，先问你" },
    body: {
      en: "A message, profile setting or trip check may suggest a change. VisePanda shows the reason first, then lets you accept or reject it.",
      zh: "一段对话、画像设置或行程检查，都可能带来修改建议。VisePanda 会先说明原因，再让你决定接受还是拒绝。",
    },
    proof: { en: "Shanghai · 3 changes waiting", zh: "上海 · 3 处改动待确认" },
    surface: "ask", chatId: "shanghai",
  },
  {
    id: "evidence",
    glyph: "visa",
    title: { en: "See where each fact came from", zh: "信息从哪来，一眼能看到" },
    body: {
      en: "Prices, opening hours, payment rules and visa answers show their source and last recheck. Old information is marked for another check.",
      zh: "价格、开放时间、支付规则和签证信息都会标出来源与复核时间。信息过期了，就会提示重新确认。",
    },
    proof: { en: "Official · Platform · Your upload", zh: "官方 · 平台 · 你上传" },
    surface: "explore",
  },
  {
    id: "unknown",
    glyph: "alert",
    title: { en: "When it isn't sure, it tells you", zh: "不确定，就明确说" },
    body: {
      en: "If an answer cannot be confirmed, VisePanda says what is missing, points to the official channel and gives you a practical next step.",
      zh: "遇到无法确认的信息，VisePanda 会说清楚缺什么、该去哪个官方渠道，以及你现在能做什么。",
    },
    proof: { en: "Delay compensation · cannot confirm", zh: "晚点补偿 · 无法确认" },
    surface: "ask", chatId: "rescue",
  },
  {
    id: "memory",
    glyph: "human",
    title: { en: "It remembers how you travel", zh: "它会记住你的旅行习惯" },
    body: {
      en: "VisePanda can remember your budget, walking range, start time, hotel style and allergies. You can see where each memory came from, change it or delete it.",
      zh: "预算、步行范围、出发时间、酒店偏好和过敏信息都可以记住。每条记忆都能查看来源，也能修改或删除。",
    },
    proof: { en: "12 memory items · peanut is a hard constraint", zh: "12 条记忆 · 花生是硬约束" },
    surface: "copilot",
  },
  {
    id: "tools",
    glyph: "translate",
    title: { en: "Useful travel tools in one place", zh: "常用工具，不用到处找" },
    body: {
      en: "Read a menu, show a Chinese ordering card, confirm a pickup point, check visa rules or prepare an eSIM. Each tool also says where its responsibility ends.",
      zh: "读菜单、出示中文点菜卡、确认上车点、查签证规则或准备 eSIM，都可以在这里完成。每个工具也会说明自己的能力边界。",
    },
    proof: { en: "5 tools · 34 screens", zh: "5 个工具 · 34 个子屏" },
    surface: "tools",
  },
  {
    id: "recovery",
    glyph: "clock",
    title: { en: "When plans change, you still have a next step", zh: "计划有变，也知道下一步" },
    body: {
      en: "A delay, closure, long queue or sick travel companion can change the day. Today suggests what to do next, but still asks before changing the Canvas.",
      zh: "晚点、闭馆、排队过长，或者同行人身体不舒服，都会打乱当天安排。Today 会给出下一步，但修改 Canvas 前仍然要问你。",
    },
    proof: { en: "9 checks · 2 not workable", zh: "9 项检查 · 2 项不可行" },
    surface: "today",
  },
];

export const FEATURES_COPY = {
  eyebrow: { en: "Try the working parts", zh: "这些功能可以直接点" },
  title: { en: "A useful trip plan has to survive the trip.", zh: "行程好不好用，出发后才知道。" },
  lede: {
    en: "Open a card to see the feature in the demo. These are prepared states, not live services.",
    zh: "点开卡片，就能直接看到对应功能。这里展示的是预设状态，不是实时服务。",
  },
  open: { en: "Open in the demo", zh: "在 Demo 中打开" },
};
