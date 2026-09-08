import type { ChatId, Localized, Turn } from "./types";

export type ChatMeta = {
  id: ChatId;
  title: Localized;
  subtitle: Localized;
  when: Localized;
};

/** Sidebar roster. `when` is fixed demo text, never a live clock. */
export const CHATS: ChatMeta[] = [
  { id: "new", title: { en: "New Chat", zh: "新对话" }, subtitle: { en: "Nothing planned yet", zh: "还没有行程" }, when: { en: "now", zh: "刚刚" } },
  { id: "shanghai", title: { en: "3 days in Shanghai", zh: "上海三日游" }, subtitle: { en: "Trip Canvas · 3 days · confirmed", zh: "Trip Canvas · 3 天 · 已确认" }, when: { en: "2d ago", zh: "2 天前" } },
  { id: "transport", title: { en: "Shanghai to Beijing", zh: "上海到北京" }, subtitle: { en: "Comparison · rail vs air", zh: "对比 · 高铁与航班" }, when: { en: "2d ago", zh: "2 天前" } },
  { id: "hotel", title: { en: "Luxury hotel in Beijing", zh: "北京豪华酒店" }, subtitle: { en: "Comparison · 3 stays", zh: "对比 · 3 家住宿" }, when: { en: "2d ago", zh: "2 天前" } },
  { id: "restaurant", title: { en: "Shanghai restaurants", zh: "上海餐厅" }, subtitle: { en: "Tonight · peanut-free", zh: "今晚 · 无花生" }, when: { en: "1d ago", zh: "1 天前" } },
  { id: "import", title: { en: "Trip guide check", zh: "攻略验证" }, subtitle: { en: "Imported · 1 conflict found", zh: "已导入 · 发现 1 处冲突" }, when: { en: "1d ago", zh: "1 天前" } },
  { id: "xian", title: { en: "2 days in Xi'an", zh: "西安两日" }, subtitle: { en: "Trip Canvas · timed entry", zh: "Trip Canvas · 分时预约" }, when: { en: "1d ago", zh: "1 天前" } },
  { id: "family", title: { en: "Travelling with parents", zh: "带父母同行" }, subtitle: { en: "Pace and access constraints", zh: "节奏与无障碍约束" }, when: { en: "6h ago", zh: "6 小时前" } },
  { id: "arrival", title: { en: "First day on the ground", zh: "落地第一天" }, subtitle: { en: "Network · payment · transfer", zh: "网络 · 支付 · 接驳" }, when: { en: "5h ago", zh: "5 小时前" } },
  { id: "rescue", title: { en: "My train is delayed", zh: "高铁晚点了" }, subtitle: { en: "Recovery · 2 changes proposed", zh: "恢复 · 已提出 2 处改动" }, when: { en: "2h ago", zh: "2 小时前" } },
  { id: "budget", title: { en: "Tighter daily budget", zh: "预算下调" }, subtitle: { en: "Rebalanced · same days", zh: "已重排 · 天数不变" }, when: { en: "1h ago", zh: "1 小时前" } },
];

export const CHAT_CONTEXT: Record<ChatId, Localized> = {
  new: { en: "China", zh: "中国" },
  shanghai: { en: "Shanghai", zh: "上海" },
  transport: { en: "Shanghai → Beijing", zh: "上海 → 北京" },
  hotel: { en: "Beijing", zh: "北京" },
  restaurant: { en: "Shanghai", zh: "上海" },
  import: { en: "Shanghai → Xi'an", zh: "上海 → 西安" },
  xian: { en: "Xi'an", zh: "西安" },
  family: { en: "Shanghai", zh: "上海" },
  arrival: { en: "Shanghai", zh: "上海" },
  rescue: { en: "Nanjing → Shanghai", zh: "南京 → 上海" },
  budget: { en: "Shanghai", zh: "上海" },
};

const RECHECK_NOTE: Localized = { en: "Rules change often. Check the official source before you rely on this.", zh: "规则经常变化，做决定前请再看一次官方信息。" };

export const CONVERSATIONS: Record<ChatId, Turn[]> = {
  new: [
    {
      role: "assistant",
      text: {
        en: "Where are you going, and what matters most on this trip? I'll ask for any missing details before I build the Trip Canvas.",
        zh: "你想去哪里？这次旅行最在意什么？信息不够的地方我会继续问，确认后再生成 Trip Canvas。",
      },
      chips: [
        { en: "3 days in Shanghai", zh: "上海三日游" },
        { en: "Shanghai to Beijing", zh: "上海到北京" },
        { en: "Check a guide I already have", zh: "检查我已有的攻略" },
      ],
    },
  ],

  shanghai: [
    {
      role: "user",
      text: { en: "Plan three relaxed days in Shanghai. I like architecture, local food, and one evening view.", zh: "帮我安排上海三日游，节奏不要太赶。我喜欢建筑、本地美食，也想看一次夜景。" },
    },
    {
      role: "assistant",
      text: { en: "Would you rather spend more time in neighbourhoods or at major sights? I can also keep most daily transfers under 45 minutes.", zh: "你想多逛街区，还是多看地标？每天的转场我也会尽量控制在 45 分钟以内。" },
      chips: [
        { en: "Mostly neighbourhoods", zh: "多逛街区" },
        { en: "Mostly landmarks", zh: "多看地标" },
        { en: "An even mix", zh: "两者各半" },
      ],
    },
    {
      role: "user",
      text: { en: "Mostly neighbourhoods, mid-range budget, and a river night view on one of the evenings.", zh: "多逛街区，预算中等，其中一晚想看浦江夜景。" },
    },
    {
      role: "assistant",
      text: { en: "I'll use the daily budget in your profile and keep the walking within your usual range.", zh: "我会按画像里的每日预算安排，步行量也控制在你平时能接受的范围内。" },
      recall: { label: { en: "From your profile", zh: "来自你的画像" }, value: { en: "Daily budget USD 180–260 · walking 7–9k steps", zh: "每日预算 USD 180–260 · 步行 7,000–9,000 步" }, memoryId: "m-budget" },
    },
    {
      role: "assistant",
      text: { en: "I'm building the Canvas now: three days, one evening by the river and no peanut in the dinner options.", zh: "正在生成 Canvas。行程共三天，其中一晚看江景，晚餐选项会避开花生。" },
      generating: true,
    },
    {
      role: "assistant",
      text: { en: "Day 2 is 2.1 km over your usual walking range. I've put three changes in the diff and left the Canvas untouched until you review them.", zh: "Day 2 的步行距离比你平时多 2.1 km。我把三处调整放进 Diff，等你确认后才会改 Canvas。" },
      confidence: "high",
    },
    {
      role: "user",
      text: { en: "Is Yu Garden ticketed right now?", zh: "豫园现在需要买票吗？" },
    },
    {
      role: "assistant",
      text: { en: "Yu Garden is ticketed, and it may use timed entry. My last check was nine days ago, so the Canvas marks this for another check.", zh: "豫园需要购票，也可能实行分时入园。上次复核是在 9 天前，所以 Canvas 会提示你再确认一次。" },
      confidence: "recheck",
      evidence: [{ kind: "official", label: { en: "Ticketing page", zh: "票务页面" }, checked: { en: "Demo recheck: 9d ago", zh: "Demo 复核：9 天前" } }],
    },
  ],

  transport: [
    { role: "user", text: { en: "Compare rail and flights from Shanghai to Beijing, then find a central hotel.", zh: "比较上海到北京的高铁和航班，再找一家位置方便的北京酒店。" } },
    {
      role: "assistant",
      text: { en: "Your budget, departure time, luggage and cancellation needs can change the result. Which one matters most?", zh: "交通预算、出发时间、行李和取消政策都会影响结果。你最在意哪一项？" },
      chips: [
        { en: "Shortest door-to-door time", zh: "门到门时间最短" },
        { en: "Lowest total cost", zh: "总花费最低" },
        { en: "Most flexible to cancel", zh: "取消最灵活" },
      ],
    },
    { role: "user", text: { en: "Shortest door to door, morning departure, one carry-on, flexible if possible.", zh: "门到门最短，上午出发，一件随身行李，尽量可取消。" } },
    {
      role: "assistant",
      text: { en: "The flight is about 30 minutes faster on paper, assuming both airport transfers go smoothly. Rail matches the preference saved in your profile.", zh: "按纸面时间算，航班大约快 30 分钟，前提是两端机场接驳都顺利。你的画像里更偏好高铁。" },
      recall: { label: { en: "From your profile", zh: "来自你的画像" }, value: { en: "Rail preferred between cities", zh: "城际优先高铁" }, memoryId: "m-transport" },
      confidence: "medium",
    },
    {
      role: "assistant",
      text: { en: "This comparison uses prepared examples. It does not show live fares, train numbers or flight numbers.", zh: "这份对比使用的是预设示例，不包含实时票价、车次号或航班号。" },
      confidence: "high",
    },
    { role: "user", text: { en: "Go with rail. What about the hotel?", zh: "那就高铁。酒店呢？" } },
    {
      role: "assistant",
      text: { en: "The Wangfujing option is a 12-minute walk from the main sights and has flexible cancellation. It is now a Canvas proposal. Nothing has been booked.", zh: "王府井这家离主要景点步行约 12 分钟，也支持灵活取消。我把它放进了 Canvas 提案，目前没有产生预订。" },
      confidence: "medium",
    },
  ],

  hotel: [
    { role: "user", text: { en: "Find a luxury hotel near the Forbidden City with a quiet room and breakfast.", zh: "找一家靠近故宫的豪华酒店，要安静房型并含早餐。" } },
    {
      role: "assistant",
      text: { en: "How many people are travelling, and do you need an airport pickup?", zh: "一共几个人出行？需要机场接送吗？" },
      chips: [
        { en: "Two of us, no pickup", zh: "两个人，不需要接送" },
        { en: "Two of us, with pickup", zh: "两个人，需要接送" },
        { en: "Just me", zh: "我一个人" },
      ],
    },
    { role: "user", text: { en: "Two of us, no pickup. Quiet matters more than the view.", zh: "两个人，不需要接送。安静比景观更重要。" } },
    {
      role: "assistant",
      text: { en: "I've compared three options by location, room type, breakfast, cancellation, international cards and English service. Only the Wangfujing option is both quiet and flexible to cancel.", zh: "我按位置、房型、早餐、取消政策、境外卡和英文服务对比了三家。只有王府井这家同时满足安静和灵活取消。" },
      confidence: "medium",
    },
    {
      role: "assistant",
      text: { en: "The nightly rate is above the range in your profile, so the Canvas flags the price instead of changing your budget.", zh: "房价高于画像里的预算区间，所以 Canvas 会标出价格，不会自动提高你的预算。" },
      recall: { label: { en: "From your profile", zh: "来自你的画像" }, value: { en: "Daily budget USD 180–260, excluding intercity transport", zh: "每日预算 USD 180–260，不含跨城交通" }, memoryId: "m-budget" },
    },
    { role: "user", text: { en: "None of these feel right.", zh: "这三家都不太合适。" } },
    {
      role: "assistant",
      text: { en: "I'll show a second set. Copilot has also recorded that courtyard-view rooms were not a good match.", zh: "我换一组给你看。Copilot 也会记下这次选择，之后少推荐庭院景观房。" },
      confidence: "high",
    },
  ],

  restaurant: [
    { role: "user", text: { en: "Find a Shanghai dinner near me, about ¥200 per person.", zh: "帮我找附近的上海晚餐，人均 200 元左右。" } },
    {
      role: "assistant",
      text: { en: "Do you have any allergies, spice limits or cuisines you want to avoid?", zh: "有没有过敏、辣度限制，或者不想吃的菜系？" },
      chips: [
        { en: "Peanut allergy, no spice limit", zh: "花生过敏，辣度无所谓" },
        { en: "No restrictions", zh: "没有限制" },
        { en: "Vegetarian tonight", zh: "今晚吃素" },
      ],
    },
    { role: "user", text: { en: "Peanut allergy. I don't mind a queue if it's under half an hour.", zh: "花生过敏。排队半小时以内可以接受。" } },
    {
      role: "assistant",
      text: { en: "Your profile already lists peanut as a hard constraint, so every food suggestion will filter for it.", zh: "你的画像已经把花生列为硬约束，之后所有餐饮建议都会自动避开。" },
      recall: { label: { en: "Hard constraint", zh: "硬约束" }, value: { en: "Peanut allergy · never changed automatically", zh: "花生过敏 · 不会自动修改" }, memoryId: "m-allergy" },
      confidence: "high",
    },
    {
      role: "assistant",
      text: { en: "I found a local restaurant 1.2 km away. Its ¥168 set menu lists no peanut, but the peak queue is 30–45 minutes. I've placed dinner at 19:00.", zh: "找到一家 1.2 公里外的本帮菜。¥168 套餐里列出的菜都不含花生，不过高峰期要排 30–45 分钟，所以晚餐安排在 19:00。" },
      confidence: "medium",
      evidence: [{ kind: "platform", label: { en: "Menu listing", zh: "菜单信息" }, checked: { en: "Demo recheck: 4d ago", zh: "Demo 复核：4 天前" } }],
    },
    { role: "user", text: { en: "Can you tell the restaurant about the allergy?", zh: "能帮我跟餐厅说明过敏情况吗？" } },
    {
      role: "assistant",
      text: { en: "This demo cannot contact the restaurant. It can make a Chinese allergy card for you to show at the table. Please still confirm with the staff before ordering.", zh: "这个 Demo 不能替你联系餐厅，但可以生成一张中文过敏说明卡，方便你到店出示。点餐前仍然要和店员再确认一次。" },
      fallback: {
        channel: { en: "Confirm with the restaurant in person or by phone", zh: "到店或致电餐厅确认" },
        nextStep: { en: "Open the translation tool and generate the ordering card", zh: "打开翻译工具，生成点菜卡" },
      },
    },
  ],

  import: [
    { role: "user", text: { en: "I uploaded 'China Trip.pdf' and this Reddit guide: reddit.com/r/travel/…", zh: "我上传了《中国旅行.pdf》，还有这个 Reddit 攻略链接：reddit.com/r/travel/…" } },
    {
      role: "assistant",
      text: { en: "I have both items. The demo is now reading dates, cities, places and order numbers. No real file is uploaded.", zh: "两份内容都已接收。Demo 正在读取日期、城市、地点和订单号，不会上传真实文件。" },
      generating: true,
    },
    {
      role: "assistant",
      text: { en: "The demo found 14 items and gave each one a confidence level. Two can stay as written. One has a timing conflict.", zh: "Demo 抽取了 14 条内容，每条都有置信度。两条可以保留原样，另有一条时间冲突。" },
      confidence: "medium",
      evidence: [{ kind: "user", label: { en: "China Trip.pdf · pages 1–4", zh: "《中国旅行.pdf》· 第 1–4 页" }, checked: { en: "From your upload", zh: "来自你的上传" } }],
    },
    {
      role: "assistant",
      text: { en: "The conflict is 'Shanghai → Xi'an after dinner'. The last departure leaves before dinner ends, and you would reach the hotel after midnight. The Canvas has not changed yet.", zh: "冲突出在「晚餐后从上海前往西安」。末班车早于晚餐结束时间，到酒店也会超过午夜。Canvas 目前还没有修改。" },
      confidence: "high",
      chips: [
        { en: "What do you suggest instead?", zh: "那你建议怎么改？" },
        { en: "Keep it, I'll skip dinner", zh: "保留，我不吃晚餐了" },
        { en: "Show me the evidence", zh: "给我看依据" },
      ],
      evidence: [{ kind: "official", label: { en: "Rail official channel", zh: "铁路官方渠道" }, checked: { en: "Demo recheck: 2d ago", zh: "Demo 复核：2 天前" } }],
    },
    { role: "user", text: { en: "What do you suggest instead?", zh: "那你建议怎么改？" } },
    {
      role: "assistant",
      text: { en: "Move the journey to the next morning and keep dinner. You would need one more hotel night in Shanghai, but you would avoid arriving after midnight. The option is waiting in the diff.", zh: "可以把这段行程移到第二天上午，保留晚餐。这样要在上海多住一晚，但能避开午夜抵达。这个方案已经放进 Diff。" },
      confidence: "high",
    },
    { role: "user", text: { en: "Was the Reddit guide reliable?", zh: "那个 Reddit 攻略靠谱吗？" } },
    {
      role: "assistant",
      text: { en: "I cannot rate the author. I matched three claims to official sources, marked two for another check and found one incorrect timing claim.", zh: "我不能评价作者是否可靠。不过其中三条能对上官方来源，两条需要再核实，还有一条时间信息不对。" },
      confidence: "medium",
    },
  ],

  xian: [
    { role: "user", text: { en: "Two days in Xi'an after Beijing. I want the Warriors and the city wall.", zh: "北京之后在西安两天，想去兵马俑和城墙。" } },
    {
      role: "assistant",
      text: { en: "The Warriors use timed entry. An 08:00 slot means leaving at 06:30, earlier than the start time in your profile. Would you rather leave early once or choose a later slot?", zh: "兵马俑实行分时预约。选 08:00 场次就要 06:30 出发，比你平时更早。这次愿意早起，还是换晚一点的场次？" },
      chips: [
        { en: "Keep my usual start, take a later slot", zh: "保持我的出发时间，选晚一点的场次" },
        { en: "Get up early this once", zh: "这次早起一次" },
        { en: "Drop the Warriors", zh: "不去兵马俑了" },
      ],
      recall: { label: { en: "From your profile", zh: "来自你的画像" }, value: { en: "Departures around 09:00, no early call times", zh: "09:00 左右出发，不安排过早集合" }, memoryId: "m-time" },
    },
    { role: "user", text: { en: "Keep my usual start. Take the afternoon slot.", zh: "保持出发时间，选下午场。" } },
    {
      role: "assistant",
      text: { en: "I've moved it to 13:00. Bring your passport, and book early because afternoon slots tend to sell out first.", zh: "已经改到 13:00。入场要带护照，下午场通常更早售罄，最好提前预约。" },
      confidence: "recheck",
      evidence: [{ kind: "official", label: { en: "Reservation page", zh: "预约页面" }, checked: { en: "Demo recheck: 2d ago", zh: "Demo 复核：2 天前" } }],
    },
    { role: "user", text: { en: "Anything to watch out for on the wall?", zh: "城墙有什么要注意的？" } },
    {
      role: "assistant",
      text: { en: "Bike rental closes before the wall. A late-afternoon loop can leave you walking back, so the Canvas puts the wall in the morning.", zh: "自行车租赁比城墙更早停止。傍晚再骑一圈，可能要步行返回，所以 Canvas 把城墙安排在上午。" },
      confidence: "medium",
    },
    { role: "user", text: { en: "Is there peanut in the food street?", zh: "回民街的吃的会有花生吗？" } },
    {
      role: "assistant",
      text: { en: "Peanut is common in local sweets there, and I cannot check every stall. The lunch node is marked, and a Chinese allergy card is ready for you to show.", zh: "那里的本地甜点经常含花生，我没法逐个摊位核实。午餐节点已经标注，也准备好了中文过敏说明卡。" },
      confidence: "recheck",
      fallback: {
        channel: { en: "Ask each vendor directly with the allergy card", zh: "用过敏说明卡逐个摊位当面确认" },
        nextStep: { en: "Open the translation tool to get the card", zh: "打开翻译工具获取说明卡" },
      },
    },
  ],

  family: [
    { role: "user", text: { en: "My parents are joining for the Shanghai days. They can't walk as far as I do.", zh: "我父母会一起来上海这几天。他们走不了我这么远。" } },
    {
      role: "assistant",
      text: { en: "I'll treat pace and access as firm requirements. How far can they walk comfortably at one time? Does anyone need step-free routes?", zh: "我会把节奏和无障碍要求当作硬条件。一次走多远比较舒服？有没有人需要无台阶路线？" },
      chips: [
        { en: "About 1 km at a time, step-free needed", zh: "一次约 1 公里，需要无台阶" },
        { en: "About 2 km at a time, stairs are fine", zh: "一次约 2 公里，台阶没问题" },
        { en: "Not sure yet", zh: "还不确定" },
      ],
    },
    { role: "user", text: { en: "About 1 km at a time, and step-free where possible.", zh: "一次约 1 公里，尽量无台阶。" } },
    {
      role: "assistant",
      text: { en: "I've saved both as hard constraints. A tight schedule will not automatically add a longer walk back into the plan.", zh: "这两项已经记为硬约束。即使行程变紧，也不会自动把长距离步行加回来。" },
      confidence: "high",
    },
    {
      role: "assistant",
      text: { en: "Day 1 walking drops from 5.6 km to 2.8 km. The new version adds two seated breaks and replaces the stair-only platform with a step-free riverside section. Both changes are in the diff.", zh: "Day 1 的步行距离从 5.6 km 降到 2.8 km。新方案增加两次坐下休息，并把只有台阶的观景平台换成无台阶滨江段。两处改动都在 Diff 里。" },
      confidence: "medium",
    },
    { role: "user", text: { en: "Is the riverside really step-free the whole way?", zh: "滨江那段真的全程无台阶吗？" } },
    {
      role: "assistant",
      text: { en: "I cannot confirm the full stretch. The access notice is eight days old and only covers the main entrances, not every ramp.", zh: "我无法确认全程无台阶。现有通行公告是 8 天前发布的，只覆盖主要入口，没有说明每一段坡道。" },
      confidence: "recheck",
      fallback: {
        channel: { en: "Riverfront management official channel", zh: "滨江管理方官方渠道" },
        nextStep: { en: "Ask on arrival at the first entrance, then tell me and I'll update the node", zh: "到第一个入口时现场问一下，再告诉我，我来更新节点" },
      },
    },
  ],

  arrival: [
    { role: "user", text: { en: "What do I actually need to do in the first hour after landing?", zh: "落地后第一个小时到底要做什么？" } },
    {
      role: "assistant",
      text: { en: "Start with connectivity, then set up payment, carry a little cash and confirm the ride into town. Which parts do you want ready before departure?", zh: "先解决网络，再准备支付、少量现金和进城交通。哪些要在出发前办好？" },
      chips: [
        { en: "All of it, before I fly", zh: "全部，出发前就办" },
        { en: "Just connectivity", zh: "只准备网络" },
        { en: "I'll handle it on arrival", zh: "落地再说" },
      ],
    },
    { role: "user", text: { en: "All of it before I fly. I'd rather not stand around at the airport.", zh: "出发前全部办好，不想在机场耗着。" } },
    {
      role: "assistant",
      text: { en: "Start with the eSIM. Buy it at home, then activate it after landing because activation may need airport Wi-Fi.", zh: "先准备 eSIM。在家完成购买，落地后再开通，因为开通过程可能需要机场 Wi-Fi。" },
      confidence: "medium",
      evidence: [{ kind: "official", label: { en: "Carrier activation page", zh: "运营商开通页" }, checked: { en: "Demo recheck: 5d ago", zh: "Demo 复核：5 天前" } }],
    },
    {
      role: "assistant",
      text: { en: "Mobile-payment card rules change often and vary by card, so this stays marked for recheck. I cannot promise that your card will bind successfully.", zh: "移动支付的绑卡规则经常变化，不同卡片也不一样，所以这里会继续标记为需复核。我不能保证你的卡一定能绑定成功。" },
      confidence: "recheck",
      fallback: {
        channel: { en: "Your card issuer and the payment provider's own help page", zh: "你的发卡行与支付方官方帮助页" },
        nextStep: { en: "Try the binding before you fly, so a failure costs you nothing", zh: "出发前先试一次绑定，失败也不影响行程" },
      },
    },
    { role: "user", text: { en: "How much cash is 'a little'?", zh: "「少量现金」是多少？" } },
    {
      role: "assistant",
      text: { en: "Carry enough for two or three small purchases. Some stalls and older taxis only take cash, but the demo does not have enough information to give you a precise amount.", zh: "准备够两三次小额消费的钱即可。部分摊位和老式出租车只收现金，但现有信息不足以给出一个准确金额。" },
      confidence: "medium",
    },
  ],

  rescue: [
    { role: "user", text: { en: "My train is running about 95 minutes late. What breaks?", zh: "我的高铁晚点大约 95 分钟。哪些安排会受影响？" } },
    {
      role: "assistant",
      text: { en: "You will miss the museum's last entry. Dinner can stay if it moves to 20:00.", zh: "你会错过美术馆的最后入场时间。晚餐改到 20:00 后仍然来得及。" },
      confidence: "high",
      evidence: [{ kind: "official", label: { en: "Rail official channel", zh: "铁路官方渠道" }, checked: { en: "Demo recheck: today", zh: "Demo 复核：今天" } }],
    },
    {
      role: "assistant",
      text: { en: "Both options are waiting for your approval. The Canvas has not changed yet.", zh: "两项调整都在等你确认，Canvas 目前没有变化。" },
      chips: [
        { en: "Can I do the museum tomorrow?", zh: "美术馆能改到明天吗？" },
        { en: "Accept both", zh: "两条都接受" },
        { en: "Is there compensation?", zh: "晚点有补偿吗？" },
      ],
    },
    { role: "user", text: { en: "Can I still make the museum tomorrow instead?", zh: "美术馆能改到明天吗？" } },
    {
      role: "assistant",
      text: { en: "Tomorrow is free until 12:40, enough for a two-hour visit. It would delay your departure, so I've kept it as a separate option for you to choose.", zh: "明天上午到 12:40 前有空，够参观两小时。不过这样会推迟出发时间，所以我把它单独列成一个备选方案。" },
      confidence: "medium",
    },
    { role: "user", text: { en: "Is there compensation for the delay?", zh: "晚点有补偿吗？" } },
    {
      role: "assistant",
      text: { en: "I cannot confirm compensation. It depends on the delay at arrival and your fare class, and the rail operator makes that decision.", zh: "我无法确认是否有补偿。结果取决于实际到站延误时间和票种，最终由铁路承运方决定。" },
      confidence: "recheck",
      fallback: {
        channel: { en: "Rail operator's official channel", zh: "铁路承运方官方渠道" },
        nextStep: { en: "Keep your ticket record until you've checked", zh: "在确认前保留好票据" },
      },
    },
  ],

  budget: [
    { role: "user", text: { en: "I need to bring the daily budget down to about ¥800. Same number of days.", zh: "每日预算要降到 ¥800 左右，天数不变。" } },
    {
      role: "assistant",
      text: { en: "The current plan is about ¥400 a day over that limit. Where would you rather cut back: food, transport or paid attractions?", zh: "现有方案每天大约超出 ¥400。你更愿意从餐饮、交通还是收费景点里省？" },
      chips: [
        { en: "Protect the food", zh: "保住餐饮" },
        { en: "Protect the attractions", zh: "保住景点" },
        { en: "Spread it evenly", zh: "平均分摊" },
      ],
    },
    { role: "user", text: { en: "Protect the food, but a mid-range dinner is fine.", zh: "保住餐饮，但中档晚餐就行。" } },
    {
      role: "assistant",
      text: { en: "A mid-range set dinner, metro instead of a taxi, and one fewer paid museum would save about ¥450 a day.", zh: "晚餐改成中档套餐、打车换地铁，再少去一个收费展馆，每天大约能省 ¥450。" },
      confidence: "medium",
    },
    {
      role: "assistant",
      text: { en: "Taking the metro adds 9 minutes of walking, which is still within your usual range.", zh: "改乘地铁会多走 9 分钟，仍在你平时能接受的范围内。" },
      recall: { label: { en: "From your profile", zh: "来自你的画像" }, value: { en: "Walking 7–9k steps per day", zh: "每天步行 7,000–9,000 步" }, memoryId: "m-walk" },
    },
    { role: "user", text: { en: "Which museum did you keep?", zh: "你留下了哪个展馆？" } },
    {
      role: "assistant",
      text: { en: "I kept the museum you rated higher after your last trip. You can change or delete that rating in Copilot.", zh: "我保留了你上次旅行后评价更高的那个展馆。这条评价可以在 Copilot 里修改或删除。" },
      confidence: "high",
      recall: { label: { en: "From your saved places", zh: "来自你的收藏" }, value: { en: "Museums rated above average interest", zh: "博物馆兴趣高于平均" }, memoryId: "m-interest" },
    },
  ],
};

export const CHAT_NOTES = { recheck: RECHECK_NOTE };
