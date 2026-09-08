export type Lang = "en" | "zh";
type Localized = Record<Lang, string>;
export const COPY = { nav: { langToggle: { en: "中文", zh: "EN" } } };
export const PRODUCT_DEMO = {
  address: "www.go2china.space/visepanda",
  nav: {
    ask: { en: "Ask VisePanda", zh: "Ask VisePanda" },
    copilot: { en: "Copilot", zh: "Copilot" },
    explore: { en: "Explore", zh: "Explore" },
    user: { en: "User", zh: "用户" },
  } satisfies Record<string, Localized>,
  ui: {
    sectionTitle: { en: "Open the demo and click around.", zh: "打开 Demo，自己点一点。" },
    sectionLede: { en: "Try a chat, review a Canvas change, look up a place or open a tool. Every screen is a prepared demo state.", zh: "换一段对话、确认一次 Canvas 改动、查一个地点，或者打开工具。里面都是准备好的演示状态。" },
    chats: { en: "Chats", zh: "对话" },
  } satisfies Record<string, Localized>,
  userProfile: {
    id: "VP-US-1048",
    name: "Michael Turner",
    email: "michael.turner@example.com",
    location: "Seattle, United States",
    language: "English",
    currency: "USD",
    timeZone: "Pacific Time",
  },
} as const;
