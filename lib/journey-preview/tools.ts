import type { Localized } from "./types";

export type ToolId = "translate" | "ride" | "visa" | "network" | "human";

export type ToolScreen = {
  id: string;
  label: Localized;
  body: Localized;
  fields?: Array<{ k: Localized; v: Localized }>;
  note?: Localized;
};

export type Tool = {
  id: ToolId;
  glyph: string;
  title: Localized;
  lede: Localized;
  /** The claim this tool explicitly does NOT make. Always rendered. */
  boundary: Localized;
  screens: ToolScreen[];
};

/** Execution tools shown in the top-level Tools surface. Every screen is a static demo state. */
export const TOOLS: Tool[] = [
  {
    id: "translate",
    glyph: "translate",
    title: { en: "Translation", zh: "翻译" },
    lede: { en: "Read the menu, ask the way, show your address.", zh: "看懂菜单、问清方向、出示地址。" },
    boundary: { en: "Demo translations are fixed samples. No live translation service is connected.", zh: "Demo 里的译文是固定示例，未接入任何实时翻译服务。" },
    screens: [
      {
        id: "text",
        label: { en: "Text translation", zh: "文本翻译" },
        body: { en: "Type or paste either language; the reply keeps both so you can point at it.", zh: "输入或粘贴任一语言，结果保留双语，方便直接指给对方看。" },
        fields: [
          { k: { en: "You typed", zh: "你输入" }, v: { en: "Is this dish made with peanut?", zh: "这道菜里有花生吗？" } },
          { k: { en: "Shown to staff", zh: "出示给店员" }, v: { en: "这道菜里有花生吗？", zh: "这道菜里有花生吗？" } },
        ],
      },
      {
        id: "tts",
        label: { en: "Speak it (TTS)", zh: "朗读（TTS）" },
        body: { en: "Plays the Chinese line out loud at a slow, clear pace.", zh: "以较慢、清晰的语速朗读中文句子。" },
        fields: [
          { k: { en: "Line", zh: "句子" }, v: { en: "请问洗手间在哪里？", zh: "请问洗手间在哪里？" } },
          { k: { en: "Speed", zh: "语速" }, v: { en: "Slow", zh: "慢速" } },
        ],
        note: { en: "Demo state only; no audio is produced on this page.", zh: "仅为 Demo 状态，本页不会真正播放音频。" },
      },
      {
        id: "stt",
        label: { en: "Hear them (STT)", zh: "听写（STT）" },
        body: { en: "Captures what the other person said and shows it in both languages.", zh: "记录对方说的话，并同时给出双语。" },
        fields: [
          { k: { en: "Heard", zh: "识别到" }, v: { en: "现在要排队大概二十分钟", zh: "现在要排队大概二十分钟" } },
          { k: { en: "Meaning", zh: "含义" }, v: { en: "About a twenty-minute wait right now", zh: "现在大约要等二十分钟" } },
        ],
      },
      {
        id: "image",
        label: { en: "Image recognition", zh: "图片识别" },
        body: { en: "Point the camera at a sign, notice or ticket and get the gist plus the exact wording.", zh: "对准指示牌、公告或票据，给出大意和原文。" },
        fields: [
          { k: { en: "Detected", zh: "识别内容" }, v: { en: "Closed on Mondays", zh: "周一闭馆" } },
          { k: { en: "Affects", zh: "影响" }, v: { en: "Day 3 museum node", zh: "Day 3 美术馆节点" } },
        ],
      },
      {
        id: "menu",
        label: { en: "Menu recognition", zh: "菜单识别" },
        body: { en: "Reads a whole menu, groups it, and marks anything that touches your hard constraints.", zh: "整页读取菜单、分组，并标出触碰你硬约束的项。" },
        fields: [
          { k: { en: "Dishes read", zh: "识别菜品" }, v: { en: "23", zh: "23 道" } },
          { k: { en: "Flagged", zh: "已标记" }, v: { en: "4 contain peanut", zh: "4 道含花生" } },
          { k: { en: "Safe picks", zh: "可选" }, v: { en: "Braised pork · scallion noodles", zh: "红烧肉 · 葱油拌面" } },
        ],
        note: { en: "Always confirm allergens with staff. Menu text can be out of date.", zh: "过敏原仍需跟店员确认，菜单文字可能过期。" },
      },
      {
        id: "direction",
        label: { en: "Direction card", zh: "问路卡" },
        body: { en: "A card you hand over: where you are, where you're going, and what you need.", zh: "一张可以直接递出去的卡片：你在哪、要去哪、需要什么。" },
        fields: [
          { k: { en: "I am going to", zh: "我要去" }, v: { en: "武康路 (Wukang Road)", zh: "武康路" } },
          { k: { en: "I need", zh: "我需要" }, v: { en: "The nearest metro entrance", zh: "最近的地铁入口" } },
        ],
      },
      {
        id: "address",
        label: { en: "Bilingual address card", zh: "中英文地址卡" },
        body: { en: "Your hotel address in Chinese and English, ready to show a driver.", zh: "酒店地址中英文对照，随时可以出示给司机。" },
        fields: [
          { k: { en: "Chinese", zh: "中文" }, v: { en: "上海市黄浦区 · 演示地址", zh: "上海市黄浦区 · 演示地址" } },
          { k: { en: "English", zh: "英文" }, v: { en: "Huangpu District, Shanghai · demo address", zh: "Huangpu District, Shanghai · demo address" } },
        ],
        note: { en: "Demo address. Not a real property.", zh: "演示地址，不对应真实物业。" },
      },
    ],
  },

  {
    id: "ride",
    glyph: "ride",
    title: { en: "Ride hailing", zh: "叫车" },
    lede: { en: "The pickup, the destination and the fare, in one place.", zh: "上车点、目的地和价格，集中在一处。" },
    boundary: {
      en: "This is an SDK interaction preview only. It does not claim any partnership, and no car is ever requested.",
      zh: "这里只是 SDK 交互展示，不声明已签约或已开放叫车，也不会发起任何真实叫车。",
    },
    screens: [
      {
        id: "locate",
        label: { en: "Current location", zh: "当前定位" },
        body: { en: "Shows the app's estimated location and its current accuracy.", zh: "显示应用估算的位置和当前定位精度。" },
        fields: [
          { k: { en: "Area", zh: "区域" }, v: { en: "Huangpu · near the riverfront", zh: "黄浦 · 滨江附近" } },
          { k: { en: "Accuracy", zh: "定位精度" }, v: { en: "≈ 30 m · confirm the pickup below", zh: "约 30 米 · 请在下方确认上车点" } },
        ],
      },
      {
        id: "pickup",
        label: { en: "Pickup point", zh: "上车点" },
        body: { en: "Uses a named pickup point that is easier for the driver to find.", zh: "使用有名称的上车点，司机更容易找到。" },
        fields: [
          { k: { en: "Selected", zh: "已选" }, v: { en: "Riverfront gate 2", zh: "滨江 2 号门" } },
          { k: { en: "Walk there", zh: "步行前往" }, v: { en: "3 min", zh: "3 分钟" } },
        ],
      },
      {
        id: "destination",
        label: { en: "Destination", zh: "目的地" },
        body: { en: "Pulled straight from the Canvas node you're heading to.", zh: "直接取自你要前往的 Canvas 节点。" },
        fields: [
          { k: { en: "From Canvas", zh: "来自 Canvas" }, v: { en: "Day 2 · café in the concession lanes", zh: "Day 2 · 衡复风貌区咖啡馆" } },
        ],
      },
      {
        id: "chinese",
        label: { en: "Chinese address", zh: "中文地址" },
        body: { en: "The destination in Chinese, shown large enough to read out or hand over.", zh: "目的地的中文写法，字号足够大，可以念出来或直接出示。" },
        fields: [
          { k: { en: "Address", zh: "地址" }, v: { en: "上海市徐汇区 · 演示地址", zh: "上海市徐汇区 · 演示地址" } },
        ],
      },
      {
        id: "class",
        label: { en: "Vehicle class", zh: "车型" },
        body: { en: "Compares the practical differences between three car classes.", zh: "对比三种车型在价格、空间和服务上的差别。" },
        fields: [
          { k: { en: "Standard", zh: "标准" }, v: { en: "4 seats · shortest wait", zh: "4 座 · 等待最短" } },
          { k: { en: "Comfort", zh: "舒适" }, v: { en: "4 seats · more legroom", zh: "4 座 · 空间更大" } },
          { k: { en: "Six seats", zh: "六座" }, v: { en: "For luggage or a group", zh: "适合行李多或多人" } },
        ],
      },
      {
        id: "fare",
        label: { en: "Simulated fare", zh: "模拟价格" },
        body: { en: "A range, not a quote. Traffic and surge are not modelled here.", zh: "给的是区间，不是报价。这里不模拟路况和溢价。" },
        fields: [
          { k: { en: "Range", zh: "区间" }, v: { en: "≈ ¥22–28 · demo fixture", zh: "约 ¥22–28 · Demo fixture" } },
          { k: { en: "Time", zh: "时长" }, v: { en: "≈ 12 min", zh: "约 12 分钟" } },
        ],
      },
      {
        id: "confirm",
        label: { en: "Trip confirmation", zh: "行程确认" },
        body: { en: "Shows the trip summary you would confirm. In this demo, the button only changes the screen.", zh: "这里显示待确认的行程摘要。在 Demo 中，按钮只会切换界面状态。" },
        fields: [
          { k: { en: "Pickup", zh: "上车点" }, v: { en: "Riverfront gate 2", zh: "滨江 2 号门" } },
          { k: { en: "Destination", zh: "目的地" }, v: { en: "Concession lanes café", zh: "衡复风貌区咖啡馆" } },
          { k: { en: "Status", zh: "状态" }, v: { en: "Not submitted", zh: "未提交" } },
        ],
        note: { en: "No ride is requested and no payment is taken.", zh: "不会发起叫车，也不会产生任何支付。" },
      },
      {
        id: "back",
        label: { en: "Back to VisePanda", zh: "返回 VisePanda" },
        body: { en: "Returning writes the leg into the Canvas as a proposal, so you still confirm it.", zh: "返回时会把这段行程作为提案写入 Canvas，仍然需要你确认。" },
        fields: [
          { k: { en: "Writes", zh: "写入" }, v: { en: "Day 2 · transit node · proposed", zh: "Day 2 · 交通节点 · 待确认" } },
        ],
      },
    ],
  },

  {
    id: "visa",
    glyph: "visa",
    title: { en: "Visa & regulations", zh: "签证与法规" },
    lede: { en: "Where the rule came from and when it was last checked.", zh: "规则从哪来，上次是什么时候复核的。" },
    boundary: {
      en: "Nothing here is legal advice or an entry guarantee. The official channel decides.",
      zh: "这里的内容不构成法律意见，也不保证入境结果，一切以官方渠道为准。",
    },
    screens: [
      {
        id: "passport",
        label: { en: "Choose passport", zh: "选择护照" },
        body: { en: "The rule set changes entirely with the passport, so this comes first.", zh: "规则会因护照而完全不同，所以这一步放在最前面。" },
        fields: [
          { k: { en: "Selected", zh: "已选" }, v: { en: "United States", zh: "美国" } },
          { k: { en: "Also affects", zh: "同时影响" }, v: { en: "Transit rules and registration", zh: "过境规则与住宿登记" } },
        ],
      },
      {
        id: "stay",
        label: { en: "Choose length of stay", zh: "选择停留时间" },
        body: { en: "Shows which stay-length threshold applies to the rule.", zh: "显示这条规则对应的停留时长门槛。" },
        fields: [
          { k: { en: "Planned", zh: "计划停留" }, v: { en: "11 days", zh: "11 天" } },
          { k: { en: "Nearest threshold", zh: "最近的门槛" }, v: { en: "Different rules apply above and below it", zh: "跨过门槛前后规则不同" } },
        ],
      },
      {
        id: "source",
        label: { en: "Rule source", zh: "规则来源" },
        body: { en: "Shows whether each statement came from an official source, a public platform or your upload.", zh: "每条结论都会注明来源，包括官方信息、公开平台或你上传的材料。" },
        fields: [
          { k: { en: "Primary", zh: "主要来源" }, v: { en: "Official channel", zh: "官方渠道" } },
          { k: { en: "Secondary", zh: "次要来源" }, v: { en: "Public platform summary", zh: "公开平台整理" } },
        ],
      },
      {
        id: "checked",
        label: { en: "Recheck date", zh: "复核日期" },
        body: { en: "How stale the answer is, stated plainly.", zh: "结论有多旧，直接写出来。" },
        fields: [
          { k: { en: "Last checked", zh: "上次复核" }, v: { en: "Demo recheck: 6d ago", zh: "Demo 复核：6 天前" } },
          { k: { en: "Validity", zh: "有效期" }, v: { en: "Treat as stale after 14 days", zh: "超过 14 天视为过期" } },
        ],
      },
      {
        id: "official",
        label: { en: "Official channel", zh: "官方渠道跳转" },
        body: { en: "Opens the official channel responsible for the final decision.", zh: "直接打开负责最终裁定的官方渠道。" },
        fields: [
          { k: { en: "Action", zh: "操作" }, v: { en: "Open official channel", zh: "打开官方渠道" } },
          { k: { en: "Status", zh: "状态" }, v: { en: "Handoff preview only", zh: "仅展示跳转" } },
        ],
      },
      {
        id: "unknown",
        label: { en: "When it isn't settled", zh: "未确定时" },
        body: { en: "If the answer cannot be confirmed, the screen shows what is missing, the official channel and the next step.", zh: "如果无法确认，界面会说明缺少什么、该查看哪个官方渠道，以及下一步怎么做。" },
        fields: [
          { k: { en: "Cannot confirm", zh: "无法确认" }, v: { en: "Whether your transit airport changes the rule", zh: "中转机场是否改变规则" } },
          { k: { en: "Official channel", zh: "官方渠道" }, v: { en: "Consular channel for your passport", zh: "对应护照的领事渠道" } },
          { k: { en: "Next step", zh: "下一步" }, v: { en: "Confirm before you book the connecting leg", zh: "在订联程票之前先确认" } },
        ],
        note: { en: "The same item is marked Recheck everywhere in the demo.", zh: "这条信息在整个 Demo 中都会标记为「需复核」。" },
      },
    ],
  },

  {
    id: "network",
    glyph: "network",
    title: { en: "Network & SIM", zh: "网络与电话卡" },
    lede: { en: "Get online, and get a number if you need one.", zh: "先能上网，需要号码时再办号码。" },
    boundary: { en: "Coverage and pricing are demo fixtures, not carrier quotes.", zh: "覆盖与价格为 Demo fixture，不是运营商报价。" },
    screens: [
      {
        id: "esim",
        label: { en: "eSIM", zh: "eSIM" },
        body: { en: "Buy before departure, activate on landing. No physical card, no counter queue.", zh: "出发前购买，落地开通。没有实体卡，不用排柜台。" },
        fields: [
          { k: { en: "Best for", zh: "适合" }, v: { en: "Data only, short trips", zh: "只要流量、短期行程" } },
          { k: { en: "Watch out", zh: "注意" }, v: { en: "Activation may need Wi-Fi on arrival", zh: "开通可能需要落地 Wi-Fi" } },
        ],
      },
      {
        id: "roaming",
        label: { en: "Roaming", zh: "漫游" },
        body: { en: "Your own number keeps working. Simplest, usually the most expensive.", zh: "原号码继续可用。最省事，通常也最贵。" },
        fields: [
          { k: { en: "Best for", zh: "适合" }, v: { en: "Keeping your number reachable", zh: "需要原号码保持可达" } },
          { k: { en: "Watch out", zh: "注意" }, v: { en: "Check the daily cap with your carrier", zh: "跟运营商确认每日封顶" } },
        ],
      },
      {
        id: "localsim",
        label: { en: "Local SIM", zh: "本地 SIM" },
        body: { en: "A local number, which some services ask for. Requires registration in person.", zh: "获得本地号码，部分服务会要求。需要本人实名登记。" },
        fields: [
          { k: { en: "Best for", zh: "适合" }, v: { en: "Longer stays, services needing a local number", zh: "长期停留、需要本地号码的服务" } },
          { k: { en: "Watch out", zh: "注意" }, v: { en: "Bring your passport to register", zh: "办理需携带护照" } },
        ],
      },
      {
        id: "wifi",
        label: { en: "Wi-Fi", zh: "Wi-Fi" },
        body: { en: "Widely available, but many networks verify by SMS and require a working phone number.", zh: "覆盖范围较广，但很多网络需要短信验证，因此要先有一个能收短信的号码。" },
        fields: [
          { k: { en: "Best for", zh: "适合" }, v: { en: "Hotels and cafés", zh: "酒店与咖啡馆" } },
          { k: { en: "Watch out", zh: "注意" }, v: { en: "SMS verification blocks you without a number", zh: "没有号码会卡在短信验证" } },
        ],
      },
      {
        id: "number",
        label: { en: "Do you need a number?", zh: "手机号需求" },
        body: { en: "Whether you need a local number determines which option fits.", zh: "是否需要本地号码，会直接影响你该选哪种方案。" },
        fields: [
          { k: { en: "Data only", zh: "只要流量" }, v: { en: "eSIM is enough", zh: "eSIM 就够" } },
          { k: { en: "Need SMS", zh: "需要收短信" }, v: { en: "Roaming or a local SIM", zh: "漫游或本地 SIM" } },
          { k: { en: "Need a local number", zh: "需要本地号码" }, v: { en: "Local SIM, registered in person", zh: "本地 SIM，需本人登记" } },
        ],
      },
      {
        id: "checklist",
        label: { en: "Preparation checklist", zh: "网络准备清单" },
        body: { en: "A checklist to finish before departure, while there is still time to fix a problem.", zh: "出发前按清单准备，遇到问题还有时间处理。" },
        fields: [
          { k: { en: "Before departure", zh: "出发前" }, v: { en: "Buy the eSIM, test the QR, note the support channel", zh: "购买 eSIM、测试二维码、记下客服渠道" } },
          { k: { en: "On landing", zh: "落地后" }, v: { en: "Activate, then confirm data before leaving the terminal", zh: "开通，并在离开航站楼前确认能上网" } },
        ],
      },
      {
        id: "binding",
        label: { en: "Payment & binding", zh: "支付与绑定提醒" },
        body: { en: "Prepares connectivity and payment together because one often depends on the other.", zh: "网络和支付往往互相影响，所以放在一起准备。" },
        fields: [
          { k: { en: "Card binding", zh: "绑卡" }, v: { en: "Rules change often · marked Recheck", zh: "规则变动频繁 · 标为需复核" } },
          { k: { en: "Fallback", zh: "兜底" }, v: { en: "Keep a small cash reserve", zh: "准备少量现金" } },
        ],
        note: { en: "Try the binding before departure so a failure costs nothing.", zh: "出发前先试一次绑定，失败也不影响行程。" },
      },
    ],
  },

  {
    id: "human",
    glyph: "human",
    title: { en: "Human handoff", zh: "人工介入" },
    lede: { en: "When the app cannot resolve a problem, prepare a clear handoff for a person.", zh: "应用解决不了的问题，可以整理成一份清楚的材料交给人工处理。" },
    boundary: {
      en: "The demo does not contact anyone. It assembles the packet you would send.",
      zh: "Demo 不会联系任何人，只是把你要发出去的求助包整理好。",
    },
    screens: [
      {
        id: "city",
        label: { en: "Current city", zh: "当前城市" },
        body: { en: "Where you are, because the answer depends on it.", zh: "你在哪，因为答案取决于此。" },
        fields: [
          { k: { en: "City", zh: "城市" }, v: { en: "Shanghai", zh: "上海" } },
          { k: { en: "Area", zh: "区域" }, v: { en: "Huangpu", zh: "黄浦" } },
        ],
      },
      {
        id: "trip",
        label: { en: "Current trip", zh: "当前 Trip" },
        body: { en: "Which plan is affected, and which node.", zh: "受影响的是哪份计划、哪个节点。" },
        fields: [
          { k: { en: "Trip", zh: "Trip" }, v: { en: "Shanghai · 3 days", zh: "上海 · 3 天" } },
          { k: { en: "Node", zh: "节点" }, v: { en: "Day 2 · peanut-free dinner", zh: "Day 2 · 无花生晚餐" } },
        ],
      },
      {
        id: "summary",
        label: { en: "Problem summary", zh: "问题摘要" },
        body: { en: "One paragraph a stranger can act on without reading the whole chat.", zh: "一段话，陌生人不用读完整个对话也能着手处理。" },
        fields: [
          { k: { en: "Summary", zh: "摘要" }, v: { en: "Restaurant cannot confirm the allergen note by phone; dinner is in 90 minutes.", zh: "餐厅电话无法确认过敏原说明；晚餐在 90 分钟后。" } },
        ],
      },
      {
        id: "tried",
        label: { en: "Already tried", zh: "已尝试步骤" },
        body: { en: "So nobody makes you repeat the first three suggestions.", zh: "这样对方不会再让你重复前三条建议。" },
        fields: [
          { k: { en: "1", zh: "1" }, v: { en: "Showed the Chinese allergy card", zh: "已出示中文过敏说明卡" } },
          { k: { en: "2", zh: "2" }, v: { en: "Called the listed number, no answer", zh: "已拨打公开电话，无人接听" } },
          { k: { en: "3", zh: "3" }, v: { en: "Checked the menu listing, four dishes flagged", zh: "已查菜单，4 道菜被标记" } },
        ],
      },
      {
        id: "emergency",
        label: { en: "Official emergency channels", zh: "官方紧急渠道" },
        body: { en: "Lists official emergency channels before the app's own support options.", zh: "官方紧急渠道会排在应用自身的帮助入口之前。" },
        fields: [
          { k: { en: "Medical", zh: "医疗" }, v: { en: "Local emergency number", zh: "当地急救电话" } },
          { k: { en: "Consular", zh: "领事" }, v: { en: "Consular channel for your passport", zh: "对应护照的领事渠道" } },
        ],
        note: { en: "Demo labels only. Confirm the actual numbers before you travel.", zh: "仅为 Demo 标签，出行前请自行确认真实号码。" },
      },
      {
        id: "escalate",
        label: { en: "Request human help", zh: "发起人工协助" },
        body: { en: "Sends the packet above. In the demo this only changes the screen.", zh: "发送上面的求助包。在 Demo 里这只会切换本屏状态。" },
        fields: [
          { k: { en: "Packet", zh: "求助包" }, v: { en: "City · trip · node · summary · steps tried", zh: "城市 · 行程 · 节点 · 摘要 · 已尝试步骤" } },
          { k: { en: "Status", zh: "状态" }, v: { en: "Not sent", zh: "未发送" } },
        ],
      },
    ],
  },
];
