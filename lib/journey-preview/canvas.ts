import type { CanvasDoc, ChatId, Evidence } from "./types";

/** Reusable evidence fixtures. Every timestamp is fixed demo text, never a live clock. */
const OFFICIAL = (label: { en: string; zh: string }, days: number, validity?: { en: string; zh: string }): Evidence => ({
  kind: "official",
  label,
  checked: { en: `Demo recheck: ${days}d ago`, zh: `Demo 复核：${days} 天前` },
  validity,
});

const PLATFORM = (label: { en: string; zh: string }, days: number): Evidence => ({
  kind: "platform",
  label,
  checked: { en: `Demo recheck: ${days}d ago`, zh: `Demo 复核：${days} 天前` },
});

const UPLOAD = (label: { en: string; zh: string }): Evidence => ({
  kind: "user",
  label,
  checked: { en: "From your upload", zh: "来自你的上传" },
});

const SEASON = { en: "Valid this season", zh: "本季有效" };

export const CANVAS: Record<ChatId, CanvasDoc> = {
  new: {
    title: { en: "No trip yet", zh: "还没有行程" },
    subtitle: { en: "Your plan will appear here", zh: "你的计划会显示在这里" },
    days: [],
    versions: [],
    bookings: [],
    empty: {
      title: { en: "Three ways to start", zh: "三种开始方式" },
      body: {
        en: "Describe a trip, import a plan you already have, or build from places you saved in Explore.",
        zh: "直接描述行程、导入你已有的计划，或从 Explore 收藏的地点开始。",
      },
      options: [
        { en: "Start from scratch", zh: "从零开始" },
        { en: "Import an existing guide", zh: "导入已有攻略" },
        { en: "Build from saved places", zh: "从收藏地点开始" },
      ],
    },
  },

  shanghai: {
    title: { en: "Shanghai · 3 days", zh: "上海 · 3 天" },
    subtitle: { en: "Neighbourhood-led, one river night view", zh: "以街区为主，含一次浦江夜景" },
    versions: [
      { id: "v1", label: { en: "v1 · First draft", zh: "v1 · 初版" }, note: { en: "Landmark-heavy, 9.4 km of walking on Day 2", zh: "地标为主，Day 2 步行 9.4 km" } },
      { id: "v2", label: { en: "v2 · Night view added", zh: "v2 · 加入夜景" }, note: { en: "Day 1 extended to the Pudong waterfront", zh: "Day 1 延长到浦东滨江" } },
      { id: "v3", label: { en: "v3 · Current", zh: "v3 · 当前" }, note: { en: "Day 2 walking reduced by 2.4 km, dinner made peanut-free", zh: "Day 2 步行减少 2.4 km，晚餐改为无花生" } },
    ],
    diff: {
      summary: { en: "3 changes waiting for you", zh: "3 处改动待确认" },
      entries: [
        {
          id: "d1",
          op: "remove",
          target: { en: "Day 2 · Second architecture stop", zh: "Day 2 · 第二个建筑点位" },
          detail: { en: "Drops 2.4 km of walking from the afternoon", zh: "下午减少 2.4 km 步行" },
          reason: { en: "Day 2 was 2.1 km over your usual walking range", zh: "Day 2 比你常走的距离多 2.1 km" },
          trigger: { en: "From your profile · walking 7–9k steps", zh: "来自画像 · 步行 7,000–9,000 步" },
        },
        {
          id: "d2",
          op: "add",
          target: { en: "Day 2 · Short ride between lanes", zh: "Day 2 · 街区之间一次短途叫车" },
          detail: { en: "About 12 minutes, replaces the removed walk", zh: "约 12 分钟，替代被移除的步行段" },
          reason: { en: "Keeps the café stop without adding distance", zh: "保留咖啡馆停留但不增加距离" },
          trigger: { en: "From your profile · short rides accepted in-city", zh: "来自画像 · 市内接受短途叫车" },
        },
        {
          id: "d3",
          op: "move",
          target: { en: "Day 2 · Dinner", zh: "Day 2 · 晚餐" },
          detail: { en: "Switched to a restaurant with a peanut-free set menu", zh: "换成有无花生套餐的餐厅" },
          reason: { en: "The previous set menu listed peanut in two dishes", zh: "原套餐有两道菜含花生" },
          trigger: { en: "Hard constraint · peanut allergy", zh: "硬约束 · 花生过敏" },
        },
      ],
    },
    days: [
      {
        id: "d1",
        label: { en: "Day 1 · Riverfront", zh: "Day 1 · 滨江" },
        summary: {
          walk: { en: "Walking 5.6 km", zh: "步行 5.6 km" },
          nodes: { en: "4 main stops", zh: "主要节点 4 个" },
          budget: { en: "≈ ¥620", zh: "约 ¥620" },
          indoor: { en: "Indoor 35%", zh: "室内 35%" },
        },
        stay: { en: "Overnight · Huangpu · next departure 09:00", zh: "住宿 · 黄浦 · 次日 09:00 出发" },
        nodes: [
          {
            id: "s1-bund", time: "09:20", kind: "sight", state: "confirmed", confidence: "high",
            title: { en: "The Bund morning walk", zh: "外滩晨间步行" },
            duration: { en: "1 h 20 m", zh: "1 小时 20 分" },
            transfer: { en: "Metro from hotel · 14 min", zh: "地铁从酒店出发 · 14 分钟" },
            cost: { en: "Free", zh: "免费" },
            map: { x: .62, y: .34 },
            evidence: [OFFICIAL({ en: "Huangpu riverfront notice", zh: "黄浦滨江公告" }, 3, SEASON)],
            risks: [{ en: "Crowded after 10:30", zh: "10:30 后人流增加" }],
          },
          {
            id: "s1-yu", time: "11:00", kind: "sight", state: "proposed", confidence: "recheck",
            title: { en: "Yu Garden", zh: "豫园" },
            duration: { en: "1 h 30 m", zh: "1 小时 30 分" },
            transfer: { en: "Walk · 18 min", zh: "步行 · 18 分钟" },
            cost: { en: "Ticketed · recheck price", zh: "需购票 · 价格待复核" },
            map: { x: .68, y: .46 },
            evidence: [OFFICIAL({ en: "Ticketing page", zh: "票务页面" }, 9)],
            risks: [{ en: "Reservation window may be required", zh: "可能需要预约时段" }],
            next: { label: { en: "Ticket channel", zh: "门票渠道" }, feedback: { en: "Ticket handoff previewed. Nothing was booked", zh: "已展示门票跳转，未产生任何预订" } },
          },
          {
            id: "s1-lunch", time: "13:00", kind: "food", state: "confirmed", confidence: "medium",
            title: { en: "Local Shanghai lunch", zh: "本帮菜午餐" },
            duration: { en: "1 h", zh: "1 小时" },
            transfer: { en: "Walk · 6 min", zh: "步行 · 6 分钟" },
            cost: { en: "≈ ¥140 pp", zh: "人均约 ¥140" },
            map: { x: .7, y: .52 },
            evidence: [PLATFORM({ en: "Public listing", zh: "公开平台信息" }, 5)],
            risks: [{ en: "Peanut appears in two house dishes", zh: "两道招牌菜含花生" }],
          },
          {
            id: "s1-night", time: "19:30", kind: "sight", state: "confirmed", confidence: "high",
            title: { en: "Pudong waterfront night view", zh: "浦东滨江夜景" },
            duration: { en: "1 h", zh: "1 小时" },
            transfer: { en: "Ferry then walk · 22 min", zh: "轮渡后步行 · 22 分钟" },
            cost: { en: "≈ ¥10", zh: "约 ¥10" },
            map: { x: .8, y: .38 },
            evidence: [OFFICIAL({ en: "Ferry timetable", zh: "轮渡时刻表" }, 3, SEASON)],
          },
        ],
      },
      {
        id: "d2",
        label: { en: "Day 2 · Lanes", zh: "Day 2 · 街区" },
        summary: {
          walk: { en: "Walking 6.8 km", zh: "步行 6.8 km" },
          nodes: { en: "4 main stops", zh: "主要节点 4 个" },
          budget: { en: "≈ ¥940", zh: "约 ¥940" },
          indoor: { en: "Indoor 40%", zh: "室内 40%" },
        },
        stay: { en: "Overnight · Huangpu · next departure 09:30", zh: "住宿 · 黄浦 · 次日 09:30 出发" },
        nodes: [
          {
            id: "s2-wukang", time: "09:40", kind: "sight", state: "confirmed", confidence: "high",
            title: { en: "Wukang Road", zh: "武康路" },
            duration: { en: "1 h 15 m", zh: "1 小时 15 分" },
            transfer: { en: "Metro · 21 min", zh: "地铁 · 21 分钟" },
            cost: { en: "Free", zh: "免费" },
            map: { x: .3, y: .5 },
            evidence: [PLATFORM({ en: "Neighbourhood guide", zh: "街区资料" }, 12)],
          },
          {
            id: "s2-ride", time: "11:10", kind: "transit", state: "proposed", confidence: "high",
            title: { en: "Short ride to the café", zh: "短途叫车前往咖啡馆" },
            duration: { en: "12 min", zh: "12 分钟" },
            cost: { en: "≈ ¥24", zh: "约 ¥24" },
            map: { x: .38, y: .55 },
            evidence: [PLATFORM({ en: "Typical fare range", zh: "常见价格区间" }, 5)],
            next: { label: { en: "Open ride tool", zh: "打开叫车工具" }, feedback: { en: "Ride demo opened. No car was requested", zh: "已打开叫车演示，未发起真实叫车" } },
          },
          {
            id: "s2-cafe", time: "11:30", kind: "food", state: "confirmed", confidence: "medium",
            title: { en: "Café in the concession lanes", zh: "衡复风貌区咖啡馆" },
            duration: { en: "50 min", zh: "50 分钟" },
            cost: { en: "≈ ¥80", zh: "约 ¥80" },
            map: { x: .42, y: .58 },
            evidence: [PLATFORM({ en: "Public listing", zh: "公开平台信息" }, 7)],
          },
          {
            id: "s2-dinner", time: "18:40", kind: "food", state: "proposed", confidence: "medium",
            title: { en: "Peanut-free set dinner", zh: "无花生套餐晚餐" },
            duration: { en: "1 h 30 m", zh: "1 小时 30 分" },
            transfer: { en: "Walk · 11 min", zh: "步行 · 11 分钟" },
            cost: { en: "≈ ¥210 pp", zh: "人均约 ¥210" },
            map: { x: .48, y: .64 },
            evidence: [PLATFORM({ en: "Menu listing", zh: "菜单信息" }, 4)],
            risks: [{ en: "Confirm the allergen note with the restaurant", zh: "到店需再次确认过敏原" }],
            next: { label: { en: "View dishes", zh: "查看菜品" }, feedback: { en: "Dish drawer opened", zh: "已打开菜品抽屉" } },
          },
        ],
      },
      {
        id: "d3",
        label: { en: "Day 3 · West Bund", zh: "Day 3 · 西岸" },
        summary: {
          walk: { en: "Walking 4.9 km", zh: "步行 4.9 km" },
          nodes: { en: "3 main stops", zh: "主要节点 3 个" },
          budget: { en: "≈ ¥760", zh: "约 ¥760" },
          indoor: { en: "Indoor 60%", zh: "室内 60%" },
        },
        nodes: [
          {
            id: "s3-museum", time: "10:00", kind: "sight", state: "recheck", confidence: "recheck",
            title: { en: "West Bund museum", zh: "西岸美术馆" },
            duration: { en: "2 h", zh: "2 小时" },
            transfer: { en: "Taxi · 24 min", zh: "打车 · 24 分钟" },
            cost: { en: "Ticketed · recheck", zh: "需购票 · 待复核" },
            map: { x: .34, y: .74 },
            evidence: [OFFICIAL({ en: "Exhibition page", zh: "展览页面" }, 21)],
            risks: [{ en: "Exhibition rotation may change opening hours", zh: "换展期间开放时间可能变化" }],
            next: { label: { en: "Official channel", zh: "官方渠道" }, feedback: { en: "Official channel previewed. Nothing was booked", zh: "已展示官方渠道，未产生任何预订" } },
          },
          {
            id: "s3-xintiandi", time: "14:30", kind: "sight", state: "confirmed", confidence: "high",
            title: { en: "Xintiandi", zh: "新天地" },
            duration: { en: "1 h 30 m", zh: "1 小时 30 分" },
            transfer: { en: "Metro · 19 min", zh: "地铁 · 19 分钟" },
            cost: { en: "Free", zh: "免费" },
            map: { x: .56, y: .62 },
          },
          {
            id: "s3-leave", time: "18:00", kind: "task", state: "inferred", confidence: "medium",
            title: { en: "Three ways to leave Shanghai", zh: "离开上海的三种方式" },
            duration: { en: "Planning", zh: "规划中" },
            map: { x: .62, y: .7 },
            risks: [{ en: "Decide before the last departure window", zh: "需在末班出发时段前决定" }],
            next: { label: { en: "Compare transport", zh: "比较交通" }, feedback: { en: "Opened the Shanghai → Beijing comparison", zh: "已打开上海 → 北京对比" } },
          },
        ],
      },
    ],
    bookings: [
      { id: "b-yu", label: { en: "Ticket", zh: "门票" }, title: { en: "Yu Garden entry", zh: "豫园预约" }, state: "proposed", action: { en: "Ticket channel", zh: "门票渠道" }, feedback: { en: "Ticket handoff previewed. Nothing was booked", zh: "已展示门票跳转，未产生任何预订" } },
      { id: "b-museum", label: { en: "Ticket", zh: "门票" }, title: { en: "West Bund museum", zh: "西岸美术馆" }, state: "recheck", action: { en: "Official channel", zh: "官方渠道" }, feedback: { en: "Official channel previewed. Nothing was booked", zh: "已展示官方渠道，未产生任何预订" } },
      { id: "b-dinner", label: { en: "Table", zh: "餐位" }, title: { en: "Day 2 peanut-free dinner", zh: "Day 2 无花生晚餐" }, state: "proposed", action: { en: "Reservation channel", zh: "预订渠道" }, feedback: { en: "Reservation handoff previewed. Nothing was booked", zh: "已展示预订跳转，未产生任何预订" } },
    ],
  },

  transport: {
    title: { en: "Shanghai → Beijing", zh: "上海 → 北京" },
    subtitle: { en: "Door to door, compared against your profile", zh: "按门到门口径，并与画像比对" },
    versions: [{ id: "v1", label: { en: "v1 · Current", zh: "v1 · 当前" }, note: { en: "Rail selected, morning departure", zh: "选择高铁，上午出发" } }],
    compare: {
      caption: { en: "Rail and air, door to door", zh: "高铁与航班，门到门对比" },
      options: [{ en: "High-speed rail", zh: "高铁" }, { en: "Flight", zh: "航班" }],
      rows: [
        { field: { en: "Door-to-door time", zh: "门到门总时长" }, values: [{ en: "≈ 6 h 10 m", zh: "约 6 小时 10 分" }, { en: "≈ 5 h 40 m", zh: "约 5 小时 40 分" }] },
        { field: { en: "In-city legs", zh: "市内接驳" }, values: [{ en: "Metro to the station, 35 min", zh: "地铁到站，35 分钟" }, { en: "Airport transfer both ends, 110 min", zh: "两端机场往返，110 分钟" }] },
        { field: { en: "Simulated fare band", zh: "模拟票价区间" }, values: [{ en: "Mid band · demo fixture", zh: "中档区间 · Demo fixture" }, { en: "Wide band · demo fixture", zh: "波动较大 · Demo fixture" }] },
        { field: { en: "Departure density", zh: "班次密度" }, values: [{ en: "Many departures daily", zh: "每日多班" }, { en: "Many departures daily", zh: "每日多班" }] },
        { field: { en: "Luggage", zh: "行李" }, values: [{ en: "Carried with you", zh: "随身携带" }, { en: "Check allowance on the official channel", zh: "托运额度需在官方渠道确认" }] },
        { field: { en: "Change and cancel", zh: "改签与取消" }, values: [{ en: "Official channel", zh: "官方渠道" }, { en: "Official channel", zh: "官方渠道" }] },
        { field: { en: "Matches your profile", zh: "与画像匹配" }, values: [{ en: "Yes · rail preferred between cities", zh: "命中 · 城际优先高铁" }, { en: "No · you would be overriding it", zh: "不命中 · 需要你手动覆盖" }], match: 0 },
      ],
      footnote: { en: "No train number, flight number or live fare is shown. All values are demo fixtures.", zh: "不展示真实车次号、航班号与实时票价，全部为 Demo fixture。" },
    },
    days: [
      {
        id: "t1",
        label: { en: "Travel day", zh: "移动日" },
        summary: {
          walk: { en: "Walking 2.1 km", zh: "步行 2.1 km" },
          nodes: { en: "4 main stops", zh: "主要节点 4 个" },
          budget: { en: "≈ ¥900", zh: "约 ¥900" },
          indoor: { en: "Indoor 80%", zh: "室内 80%" },
        },
        nodes: [
          { id: "t-out", time: "08:10", kind: "transit", state: "confirmed", confidence: "high", title: { en: "Hotel → Hongqiao area", zh: "酒店 → 虹桥片区" }, duration: { en: "35 min", zh: "35 分钟" }, cost: { en: "≈ ¥8", zh: "约 ¥8" }, map: { x: .2, y: .4 }, evidence: [OFFICIAL({ en: "Metro operator", zh: "轨交运营方" }, 4, SEASON)] },
          { id: "t-rail", time: "09:30", kind: "transit", state: "proposed", confidence: "medium", title: { en: "Shanghai → Beijing by rail", zh: "上海 → 北京 高铁" }, duration: { en: "≈ 4 h 30 m", zh: "约 4 小时 30 分" }, cost: { en: "Mid band · demo fixture", zh: "中档区间 · Demo fixture" }, map: { x: .5, y: .3 }, evidence: [OFFICIAL({ en: "Rail official channel", zh: "铁路官方渠道" }, 2)], risks: [{ en: "Book before the seat class you want sells out", zh: "座位等级可能提前售完" }], next: { label: { en: "Official channel", zh: "官方渠道" }, feedback: { en: "Rail handoff previewed. Nothing was booked", zh: "已展示铁路官方跳转，未产生任何预订" } } },
          { id: "t-in", time: "14:20", kind: "transit", state: "confirmed", confidence: "high", title: { en: "Beijing South → Wangfujing", zh: "北京南 → 王府井" }, duration: { en: "32 min", zh: "32 分钟" }, cost: { en: "≈ ¥7", zh: "约 ¥7" }, map: { x: .74, y: .34 } },
          { id: "t-hotel", time: "15:10", kind: "stay", state: "proposed", confidence: "medium", title: { en: "Check in · Wangfujing", zh: "入住 · 王府井" }, duration: { en: "30 min", zh: "30 分钟" }, map: { x: .8, y: .42 }, next: { label: { en: "View hotel", zh: "查看酒店" }, feedback: { en: "Hotel handoff previewed. Nothing was booked", zh: "已展示酒店跳转，未产生任何预订" } } },
        ],
      },
    ],
    bookings: [
      { id: "b-rail", label: { en: "Rail", zh: "高铁" }, title: { en: "Shanghai → Beijing", zh: "上海 → 北京" }, state: "proposed", action: { en: "Official channel", zh: "官方渠道" }, feedback: { en: "Rail handoff previewed. Nothing was booked", zh: "已展示铁路官方跳转，未产生任何预订" } },
      { id: "b-hotel", label: { en: "Hotel", zh: "酒店" }, title: { en: "Wangfujing · Beijing", zh: "北京 · 王府井" }, state: "proposed", action: { en: "View hotel", zh: "查看酒店" }, feedback: { en: "Hotel handoff previewed. Nothing was booked", zh: "已展示酒店跳转，未产生任何预订" } },
    ],
  },

  hotel: {
    title: { en: "Beijing luxury stay", zh: "北京豪华住宿" },
    subtitle: { en: "Quiet room, breakfast, flexible cancellation", zh: "安静房型、含早餐、可灵活取消" },
    versions: [{ id: "v1", label: { en: "v1 · Current", zh: "v1 · 当前" }, note: { en: "Three options shortlisted", zh: "已筛出三个备选" } }],
    compare: {
      caption: { en: "Three shortlisted stays", zh: "三个备选住宿" },
      options: [{ en: "Wangfujing", zh: "王府井" }, { en: "Qianmen", zh: "前门" }, { en: "Guomao", zh: "国贸" }],
      rows: [
        { field: { en: "To the main sights", zh: "到主要景点" }, values: [{ en: "12 min on foot", zh: "步行 12 分钟" }, { en: "18 min on foot", zh: "步行 18 分钟" }, { en: "28 min by metro", zh: "地铁 28 分钟" }], match: 0 },
        { field: { en: "Room type", zh: "房型" }, values: [{ en: "Courtyard view, quiet side", zh: "庭院景观，安静侧" }, { en: "Heritage suite, street side", zh: "传统套房，临街" }, { en: "High floor, city view", zh: "高层，城市景观" }] },
        { field: { en: "Breakfast", zh: "早餐" }, values: [{ en: "Included", zh: "含" }, { en: "Included", zh: "含" }, { en: "Extra charge", zh: "另收费" }] },
        { field: { en: "Cancellation", zh: "取消政策" }, values: [{ en: "Flexible", zh: "灵活" }, { en: "Flexible", zh: "灵活" }, { en: "Partial", zh: "部分可退" }], match: 0 },
        { field: { en: "International cards", zh: "境外卡" }, values: [{ en: "Confirm before booking", zh: "预订前确认" }, { en: "Confirm before booking", zh: "预订前确认" }, { en: "Confirm before booking", zh: "预订前确认" }] },
        { field: { en: "English service", zh: "英文服务" }, values: [{ en: "Available", zh: "可提供" }, { en: "Available", zh: "可提供" }, { en: "Available", zh: "可提供" }] },
        { field: { en: "Why this one for you", zh: "为什么推荐给你" }, values: [{ en: "Quiet side + flexible cancel matches your profile", zh: "安静侧 + 可灵活取消，命中你的画像" }, { en: "Street side conflicts with your quiet preference", zh: "临街与你的安静偏好冲突" }, { en: "Transfer time exceeds your usual range", zh: "交通时间超过你的常规范围" }], match: 0 },
      ],
      footnote: { en: "Rates, availability and policies are demo fixtures, not live inventory.", zh: "价格、房态与政策均为 Demo fixture，不代表实时库存。" },
    },
    days: [
      {
        id: "h1",
        label: { en: "Stay", zh: "住宿" },
        summary: {
          walk: { en: "Walking 1.4 km", zh: "步行 1.4 km" },
          nodes: { en: "2 main stops", zh: "主要节点 2 个" },
          budget: { en: "Above your usual band", zh: "高于你的常规区间" },
          indoor: { en: "Indoor 90%", zh: "室内 90%" },
        },
        nodes: [
          { id: "h-in", time: "15:00", kind: "stay", state: "proposed", confidence: "medium", title: { en: "Wangfujing · courtyard view", zh: "王府井 · 庭院景观" }, duration: { en: "3 nights", zh: "3 晚" }, cost: { en: "Above your usual band", zh: "高于你的常规区间" }, map: { x: .5, y: .4 }, evidence: [PLATFORM({ en: "Property listing", zh: "酒店信息页" }, 6)], risks: [{ en: "Above your daily budget band", zh: "超出你的每日预算区间" }], next: { label: { en: "View hotel", zh: "查看酒店" }, feedback: { en: "Hotel handoff previewed. Nothing was booked", zh: "已展示酒店跳转，未产生任何预订" } } },
          { id: "h-alt", time: "—", kind: "task", state: "inferred", confidence: "medium", title: { en: "Not satisfied? Load another three", zh: "都不满意？换一批" }, map: { x: .6, y: .55 }, next: { label: { en: "Show another set", zh: "换一批" }, feedback: { en: "Second preset comparison loaded", zh: "已切换到第二组预置对比" } } },
        ],
      },
    ],
    bookings: [
      { id: "b-stay", label: { en: "Hotel", zh: "酒店" }, title: { en: "Wangfujing · 3 nights", zh: "王府井 · 3 晚" }, state: "proposed", action: { en: "View hotel", zh: "查看酒店" }, feedback: { en: "Hotel handoff previewed. Nothing was booked", zh: "已展示酒店跳转，未产生任何预订" } },
    ],
  },

  restaurant: {
    title: { en: "Restaurant match", zh: "餐厅匹配" },
    subtitle: { en: "Peanut-free, mid budget, near you", zh: "无花生、中等预算、就在附近" },
    versions: [{ id: "v1", label: { en: "v1 · Current", zh: "v1 · 当前" }, note: { en: "Allergen filter applied", zh: "已应用过敏原过滤" } }],
    days: [
      {
        id: "r1",
        label: { en: "Tonight", zh: "今晚" },
        summary: {
          walk: { en: "Walking 1.2 km", zh: "步行 1.2 km" },
          nodes: { en: "2 main stops", zh: "主要节点 2 个" },
          budget: { en: "≈ ¥200 pp", zh: "人均约 ¥200" },
          indoor: { en: "Indoor 100%", zh: "室内 100%" },
        },
        nodes: [
          { id: "r-place", time: "19:00", kind: "food", state: "proposed", confidence: "medium", title: { en: "Local Shanghai cuisine", zh: "上海本帮菜" }, duration: { en: "1 h 30 m", zh: "1 小时 30 分" }, transfer: { en: "Walk · 15 min", zh: "步行 · 15 分钟" }, cost: { en: "≈ ¥168 set menu", zh: "团购套餐约 ¥168" }, map: { x: .45, y: .5 }, evidence: [PLATFORM({ en: "Menu listing", zh: "菜单信息" }, 4)], risks: [{ en: "Queue can run 30–45 min at peak", zh: "高峰排队 30–45 分钟" }], next: { label: { en: "Group deal channel", zh: "团购渠道" }, feedback: { en: "Group deal handoff previewed. Nothing was purchased", zh: "已展示团购跳转，未产生任何购买" } } },
          { id: "r-dish", time: "Dish", kind: "food", state: "confirmed", confidence: "high", title: { en: "Braised pork · Scallion noodles", zh: "红烧肉 · 葱油拌面" }, cost: { en: "Included in the set", zh: "含在套餐内" }, map: { x: .5, y: .6 }, evidence: [PLATFORM({ en: "Dish listing", zh: "菜品信息" }, 4)], risks: [{ en: "Contains pork, soy and wheat · no peanut", zh: "含猪肉、酱油、小麦 · 不含花生" }], next: { label: { en: "View dishes", zh: "查看菜品" }, feedback: { en: "Dish drawer opened", zh: "已打开菜品抽屉" } } },
        ],
      },
    ],
    bookings: [
      { id: "b-table", label: { en: "Table", zh: "餐位" }, title: { en: "Tonight · 19:00", zh: "今晚 · 19:00" }, state: "proposed", action: { en: "Group deal channel", zh: "团购渠道" }, feedback: { en: "Group deal handoff previewed. Nothing was purchased", zh: "已展示团购跳转，未产生任何购买" } },
    ],
  },

  import: {
    title: { en: "Imported guide review", zh: "导入攻略检查" },
    subtitle: { en: "Two workable stops, one timing conflict", zh: "两个合理节点，一个时间冲突" },
    versions: [
      { id: "v1", label: { en: "v1 · As imported", zh: "v1 · 导入原样" }, note: { en: "Straight from your PDF and link", zh: "直接来自你的 PDF 与链接" } },
      { id: "v2", label: { en: "v2 · Current", zh: "v2 · 当前" }, note: { en: "Conflict flagged, replacement proposed", zh: "已标出冲突并给出替代" } },
    ],
    diff: {
      summary: { en: "1 change waiting for you", zh: "1 处改动待确认" },
      entries: [
        {
          id: "i1",
          op: "move",
          target: { en: "Shanghai → Xi'an after dinner", zh: "晚餐后上海前往西安" },
          detail: { en: "Move to the following morning", zh: "改到次日上午" },
          reason: { en: "The last departure leaves before your dinner ends, and check-in would fall after midnight", zh: "末班车早于你的晚餐结束时间，且入住会落在午夜之后" },
          trigger: { en: "Simulator check · last departure and transfer time", zh: "模拟器检查 · 末班与转场时间" },
        },
      ],
    },
    days: [
      {
        id: "i1",
        label: { en: "Imported day", zh: "导入的一天" },
        summary: {
          walk: { en: "Walking 7.4 km", zh: "步行 7.4 km" },
          nodes: { en: "3 main stops", zh: "主要节点 3 个" },
          budget: { en: "Not stated in your guide", zh: "攻略里未写预算" },
          indoor: { en: "Indoor 20%", zh: "室内 20%" },
        },
        nodes: [
          { id: "i-bund", time: "08:30", kind: "sight", state: "confirmed", confidence: "high", title: { en: "The Bund morning walk", zh: "外滩晨间步行" }, duration: { en: "1 h", zh: "1 小时" }, map: { x: .6, y: .34 }, evidence: [UPLOAD({ en: "China Trip.pdf · page 2", zh: "《中国旅行.pdf》· 第 2 页" })] },
          { id: "i-yu", time: "14:00", kind: "sight", state: "confirmed", confidence: "medium", title: { en: "Yu Garden afternoon", zh: "下午游览豫园" }, duration: { en: "2 h", zh: "2 小时" }, map: { x: .68, y: .46 }, evidence: [UPLOAD({ en: "Reddit guide · comment thread", zh: "Reddit 攻略 · 评论区" }), OFFICIAL({ en: "Ticketing page", zh: "票务页面" }, 9)] },
          { id: "i-conflict", time: "!", kind: "transit", state: "recheck", confidence: "recheck", title: { en: "Shanghai → Xi'an after dinner", zh: "晚餐后上海前往西安" }, map: { x: .35, y: .6 }, evidence: [OFFICIAL({ en: "Rail official channel", zh: "铁路官方渠道" }, 2)], risks: [{ en: "Last departure is earlier than your dinner end", zh: "末班车早于晚餐结束时间" }, { en: "Hotel check-in would fall after midnight", zh: "酒店入住会落在午夜之后" }] },
        ],
      },
    ],
    bookings: [
      { id: "b-recheck", label: { en: "Recheck", zh: "复核" }, title: { en: "Rail departure window", zh: "高铁出发时段" }, state: "recheck", action: { en: "Official channel", zh: "官方渠道" }, feedback: { en: "Official channel previewed. Nothing was booked", zh: "已展示官方渠道，未产生任何预订" } },
    ],
  },

  xian: {
    title: { en: "Xi'an · 2 days", zh: "西安 · 2 天" },
    subtitle: { en: "Timed-entry sights, early start avoided", zh: "分时预约景点，不安排过早集合" },
    versions: [{ id: "v1", label: { en: "v1 · Current", zh: "v1 · 当前" }, note: { en: "Warriors moved to the afternoon slot", zh: "兵马俑改到下午时段" } }],
    diff: {
      summary: { en: "1 change waiting for you", zh: "1 处改动待确认" },
      entries: [
        {
          id: "x1",
          op: "move",
          target: { en: "Terracotta Warriors", zh: "兵马俑" },
          detail: { en: "From 08:00 to the 13:00 timed slot", zh: "从 08:00 改到 13:00 分时段" },
          reason: { en: "An 08:00 slot needs a 06:30 departure", zh: "08:00 场次需要 06:30 出发" },
          trigger: { en: "From your profile · departures around 09:00", zh: "来自画像 · 09:00 左右出发" },
        },
      ],
    },
    days: [
      {
        id: "x1",
        label: { en: "Day 1 · Inside the walls", zh: "Day 1 · 城墙以内" },
        summary: { walk: { en: "Walking 6.2 km", zh: "步行 6.2 km" }, nodes: { en: "3 main stops", zh: "主要节点 3 个" }, budget: { en: "≈ ¥520", zh: "约 ¥520" }, indoor: { en: "Indoor 30%", zh: "室内 30%" } },
        stay: { en: "Overnight · inside the walls · next departure 09:20", zh: "住宿 · 城墙内 · 次日 09:20 出发" },
        nodes: [
          { id: "x-wall", time: "09:40", kind: "sight", state: "confirmed", confidence: "high", title: { en: "City Wall, south gate section", zh: "城墙南门段" }, duration: { en: "1 h 40 m", zh: "1 小时 40 分" }, cost: { en: "Ticketed", zh: "需购票" }, map: { x: .5, y: .5 }, evidence: [OFFICIAL({ en: "Ticketing page", zh: "票务页面" }, 6, SEASON)], risks: [{ en: "Bike rental closes before the wall does", zh: "自行车租借早于城墙关闭" }] },
          { id: "x-muslim", time: "12:30", kind: "food", state: "proposed", confidence: "medium", title: { en: "Lunch in the food street", zh: "回民街午餐" }, duration: { en: "1 h 10 m", zh: "1 小时 10 分" }, cost: { en: "≈ ¥90 pp", zh: "人均约 ¥90" }, map: { x: .44, y: .42 }, risks: [{ en: "Peanut is common in local sweets", zh: "本地甜点常含花生" }] },
          { id: "x-bell", time: "16:00", kind: "sight", state: "confirmed", confidence: "high", title: { en: "Bell and Drum towers", zh: "钟楼与鼓楼" }, duration: { en: "1 h", zh: "1 小时" }, map: { x: .52, y: .38 } },
        ],
      },
      {
        id: "x2",
        label: { en: "Day 2 · Warriors", zh: "Day 2 · 兵马俑" },
        summary: { walk: { en: "Walking 5.1 km", zh: "步行 5.1 km" }, nodes: { en: "2 main stops", zh: "主要节点 2 个" }, budget: { en: "≈ ¥680", zh: "约 ¥680" }, indoor: { en: "Indoor 70%", zh: "室内 70%" } },
        nodes: [
          { id: "x-out", time: "11:20", kind: "transit", state: "confirmed", confidence: "high", title: { en: "City → museum area", zh: "市区 → 博物馆片区" }, duration: { en: "1 h 10 m", zh: "1 小时 10 分" }, cost: { en: "≈ ¥120 round trip", zh: "往返约 ¥120" }, map: { x: .3, y: .6 } },
          { id: "x-warriors", time: "13:00", kind: "sight", state: "proposed", confidence: "recheck", title: { en: "Terracotta Warriors · timed slot", zh: "兵马俑 · 分时段" }, duration: { en: "2 h 30 m", zh: "2 小时 30 分" }, cost: { en: "Ticketed · slot required", zh: "需购票 · 需选时段" }, map: { x: .72, y: .55 }, evidence: [OFFICIAL({ en: "Reservation page", zh: "预约页面" }, 2)], risks: [{ en: "Passport is required at entry", zh: "入场需要护照" }, { en: "Afternoon slots sell out first", zh: "下午时段更早售罄" }], next: { label: { en: "Reservation channel", zh: "预约渠道" }, feedback: { en: "Reservation handoff previewed. Nothing was booked", zh: "已展示预约跳转，未产生任何预订" } } },
        ],
      },
    ],
    bookings: [
      { id: "b-warriors", label: { en: "Reservation", zh: "预约" }, title: { en: "Warriors · afternoon slot", zh: "兵马俑 · 下午时段" }, state: "proposed", action: { en: "Reservation channel", zh: "预约渠道" }, feedback: { en: "Reservation handoff previewed. Nothing was booked", zh: "已展示预约跳转，未产生任何预订" } },
      { id: "b-wall", label: { en: "Ticket", zh: "门票" }, title: { en: "City Wall south gate", zh: "城墙南门" }, state: "confirmed", action: { en: "Ticket channel", zh: "门票渠道" }, feedback: { en: "Ticket handoff previewed. Nothing was booked", zh: "已展示门票跳转，未产生任何预订" } },
    ],
  },

  family: {
    title: { en: "Travelling with parents", zh: "带父母同行" },
    subtitle: { en: "Shorter days, seated breaks, step-free where possible", zh: "缩短单日、增加落座休息、尽量无台阶" },
    versions: [
      { id: "v1", label: { en: "v1 · Original pace", zh: "v1 · 原节奏" }, note: { en: "Same plan as your solo Shanghai days", zh: "与你独自出行的上海行程一致" } },
      { id: "v2", label: { en: "v2 · Current", zh: "v2 · 当前" }, note: { en: "Walking halved, two seated breaks added", zh: "步行减半，增加两次落座休息" } },
    ],
    diff: {
      summary: { en: "2 changes waiting for you", zh: "2 处改动待确认" },
      entries: [
        { id: "f1", op: "add", target: { en: "Seated break after each main stop", zh: "每个主要节点后增加落座休息" }, detail: { en: "Two 30-minute breaks", zh: "两次 30 分钟休息" }, reason: { en: "Continuous walking above 2 km was reported as too much", zh: "连续步行超过 2 km 被反馈为过量" }, trigger: { en: "You said it in this chat", zh: "来自你在本次对话中的说明" } },
        { id: "f2", op: "remove", target: { en: "Stair-only viewing platform", zh: "只有台阶的观景平台" }, detail: { en: "Replaced with a step-free riverside stretch", zh: "替换为无台阶的滨江段" }, reason: { en: "No lift access is listed for that platform", zh: "该平台未标注电梯通道" }, trigger: { en: "Hard constraint · step-free access", zh: "硬约束 · 无障碍通行" } },
      ],
    },
    days: [
      {
        id: "f1",
        label: { en: "Day 1 · Slow riverfront", zh: "Day 1 · 慢速滨江" },
        summary: { walk: { en: "Walking 2.8 km", zh: "步行 2.8 km" }, nodes: { en: "3 main stops", zh: "主要节点 3 个" }, budget: { en: "≈ ¥780", zh: "约 ¥780" }, indoor: { en: "Indoor 55%", zh: "室内 55%" } },
        nodes: [
          { id: "f-start", time: "10:00", kind: "task", state: "confirmed", confidence: "high", title: { en: "Late start, no early call", zh: "晚出发，不安排早集合" }, map: { x: .3, y: .3 } },
          { id: "f-bund", time: "10:40", kind: "sight", state: "confirmed", confidence: "high", title: { en: "Bund riverside, step-free stretch", zh: "外滩滨江无台阶段" }, duration: { en: "50 min", zh: "50 分钟" }, transfer: { en: "Taxi · 16 min", zh: "打车 · 16 分钟" }, map: { x: .6, y: .34 }, evidence: [OFFICIAL({ en: "Riverfront access notice", zh: "滨江通行公告" }, 8)], risks: [{ en: "Benches are limited at midday", zh: "正午座位有限" }] },
          { id: "f-rest", time: "11:40", kind: "food", state: "proposed", confidence: "high", title: { en: "Seated break · tea house", zh: "落座休息 · 茶室" }, duration: { en: "30 min", zh: "30 分钟" }, cost: { en: "≈ ¥60", zh: "约 ¥60" }, map: { x: .64, y: .42 } },
          { id: "f-lunch", time: "12:40", kind: "food", state: "confirmed", confidence: "medium", title: { en: "Lunch · soft-texture options", zh: "午餐 · 口感偏软的选择" }, duration: { en: "1 h 10 m", zh: "1 小时 10 分" }, cost: { en: "≈ ¥150 pp", zh: "人均约 ¥150" }, map: { x: .68, y: .5 }, risks: [{ en: "Ask for lower salt when ordering", zh: "点餐时说明少盐" }] },
        ],
      },
    ],
    bookings: [
      { id: "b-access", label: { en: "Recheck", zh: "复核" }, title: { en: "Step-free access at each stop", zh: "各节点无障碍通行" }, state: "recheck", action: { en: "Official channel", zh: "官方渠道" }, feedback: { en: "Official channel previewed. Nothing was booked", zh: "已展示官方渠道，未产生任何预订" } },
    ],
  },

  arrival: {
    title: { en: "First day on the ground", zh: "落地第一天" },
    subtitle: { en: "Connectivity, payment and the ride into town", zh: "网络、支付与进城交通" },
    versions: [{ id: "v1", label: { en: "v1 · Current", zh: "v1 · 当前" }, note: { en: "Prepared before departure", zh: "出发前已准备" } }],
    days: [
      {
        id: "a1",
        label: { en: "Arrival day", zh: "抵达当天" },
        summary: { walk: { en: "Walking 1.6 km", zh: "步行 1.6 km" }, nodes: { en: "4 main stops", zh: "主要节点 4 个" }, budget: { en: "≈ ¥400", zh: "约 ¥400" }, indoor: { en: "Indoor 85%", zh: "室内 85%" } },
        nodes: [
          { id: "a-sim", time: "On landing", kind: "task", state: "confirmed", confidence: "high", title: { en: "Activate the eSIM you prepared", zh: "启用出发前准备的 eSIM" }, duration: { en: "10 min", zh: "10 分钟" }, map: { x: .2, y: .3 }, evidence: [OFFICIAL({ en: "Carrier activation page", zh: "运营商开通页" }, 5)], risks: [{ en: "Activation may need Wi-Fi on arrival", zh: "开通可能需要落地 Wi-Fi" }], next: { label: { en: "Open network tool", zh: "打开网络工具" }, feedback: { en: "Network tool demo opened", zh: "已打开网络工具演示" } } },
          { id: "a-pay", time: "+15 min", kind: "task", state: "recheck", confidence: "recheck", title: { en: "Link a card to mobile payment", zh: "把银行卡绑定到移动支付" }, duration: { en: "15 min", zh: "15 分钟" }, map: { x: .34, y: .38 }, evidence: [OFFICIAL({ en: "Payment provider help page", zh: "支付方帮助页" }, 14)], risks: [{ en: "Binding rules change often · recheck before you rely on it", zh: "绑定规则变动频繁 · 依赖前需复核" }] },
          { id: "a-cash", time: "+30 min", kind: "task", state: "inferred", confidence: "medium", title: { en: "Keep a small cash reserve", zh: "准备少量现金备用" }, map: { x: .46, y: .46 }, risks: [{ en: "Some small vendors are cash-only", zh: "部分小商户仅收现金" }] },
          { id: "a-ride", time: "+45 min", kind: "transit", state: "proposed", confidence: "medium", title: { en: "Airport → hotel", zh: "机场 → 酒店" }, duration: { en: "55 min", zh: "55 分钟" }, cost: { en: "≈ ¥180", zh: "约 ¥180" }, map: { x: .68, y: .56 }, next: { label: { en: "Open ride tool", zh: "打开叫车工具" }, feedback: { en: "Ride demo opened. No car was requested", zh: "已打开叫车演示，未发起真实叫车" } } },
        ],
      },
    ],
    bookings: [
      { id: "b-esim", label: { en: "Prepare", zh: "准备" }, title: { en: "eSIM activation", zh: "eSIM 开通" }, state: "confirmed", action: { en: "Official channel", zh: "官方渠道" }, feedback: { en: "Official channel previewed. Nothing was purchased", zh: "已展示官方渠道，未产生任何购买" } },
      { id: "b-pay", label: { en: "Recheck", zh: "复核" }, title: { en: "Card binding rules", zh: "银行卡绑定规则" }, state: "recheck", action: { en: "Official channel", zh: "官方渠道" }, feedback: { en: "Official channel previewed", zh: "已展示官方渠道" } },
    ],
  },

  rescue: {
    title: { en: "Delay recovery", zh: "延误恢复" },
    subtitle: { en: "Your train is late. These parts still work", zh: "高铁晚点了，下面这些安排仍然可行" },
    versions: [
      { id: "v1", label: { en: "v1 · Before the delay", zh: "v1 · 延误前" }, note: { en: "Museum at 14:00, dinner at 18:30", zh: "14:00 美术馆，18:30 晚餐" } },
      { id: "v2", label: { en: "v2 · Current", zh: "v2 · 当前" }, note: { en: "Museum dropped, dinner moved later", zh: "取消美术馆，晚餐后移" } },
    ],
    diff: {
      summary: { en: "2 changes waiting for you", zh: "2 处改动待确认" },
      entries: [
        { id: "rs1", op: "remove", target: { en: "Afternoon museum", zh: "下午的美术馆" }, detail: { en: "Arrival is now after the last entry time", zh: "抵达时间晚于最后入场时间" }, reason: { en: "A 95-minute delay eats the whole visit window", zh: "95 分钟延误吃掉整个参观窗口" }, trigger: { en: "External condition · reported delay", zh: "外部条件 · 已通报的延误" } },
        { id: "rs2", op: "move", target: { en: "Dinner", zh: "晚餐" }, detail: { en: "From 18:30 to 20:00, same restaurant", zh: "从 18:30 改到 20:00，餐厅不变" }, reason: { en: "Keeps the reservation you already like", zh: "保留你已经认可的餐位" }, trigger: { en: "Simulator check · transfer time", zh: "模拟器检查 · 转场时间" } },
      ],
    },
    days: [
      {
        id: "rs1",
        label: { en: "Today, revised", zh: "今天，已调整" },
        summary: { walk: { en: "Walking 3.2 km", zh: "步行 3.2 km" }, nodes: { en: "3 main stops", zh: "主要节点 3 个" }, budget: { en: "≈ ¥410", zh: "约 ¥410" }, indoor: { en: "Indoor 75%", zh: "室内 75%" } },
        nodes: [
          { id: "rs-delay", time: "!", kind: "transit", state: "recheck", confidence: "recheck", title: { en: "Train delayed ≈ 95 min", zh: "列车晚点约 95 分钟" }, map: { x: .3, y: .3 }, evidence: [OFFICIAL({ en: "Rail official channel", zh: "铁路官方渠道" }, 0)], risks: [{ en: "Delay may still grow · recheck before acting", zh: "延误可能继续扩大 · 行动前复核" }] },
          { id: "rs-arrive", time: "16:15", kind: "transit", state: "proposed", confidence: "medium", title: { en: "Arrive and drop bags", zh: "抵达并放行李" }, duration: { en: "40 min", zh: "40 分钟" }, map: { x: .5, y: .42 } },
          { id: "rs-dinner", time: "20:00", kind: "food", state: "proposed", confidence: "medium", title: { en: "Dinner, moved later", zh: "晚餐，时间后移" }, duration: { en: "1 h 30 m", zh: "1 小时 30 分" }, cost: { en: "≈ ¥210 pp", zh: "人均约 ¥210" }, map: { x: .66, y: .58 }, next: { label: { en: "Reservation channel", zh: "预订渠道" }, feedback: { en: "Reservation handoff previewed. Nothing was changed", zh: "已展示预订跳转，未修改任何预订" } } },
        ],
      },
    ],
    bookings: [
      { id: "b-move", label: { en: "Table", zh: "餐位" }, title: { en: "Move dinner to 20:00", zh: "晚餐改到 20:00" }, state: "proposed", action: { en: "Reservation channel", zh: "预订渠道" }, feedback: { en: "Reservation handoff previewed. Nothing was changed", zh: "已展示预订跳转，未修改任何预订" } },
      { id: "b-refund", label: { en: "Recheck", zh: "复核" }, title: { en: "Delay compensation rules", zh: "延误补偿规则" }, state: "recheck", action: { en: "Official channel", zh: "官方渠道" }, feedback: { en: "Official channel previewed", zh: "已展示官方渠道" } },
    ],
  },

  budget: {
    title: { en: "Tighter budget", zh: "预算下调" },
    subtitle: { en: "Same days, ¥400 less per day", zh: "天数不变，每天少花 ¥400" },
    versions: [
      { id: "v1", label: { en: "v1 · Original budget", zh: "v1 · 原预算" }, note: { en: "≈ ¥1,200 per day", zh: "每天约 ¥1,200" } },
      { id: "v2", label: { en: "v2 · Current", zh: "v2 · 当前" }, note: { en: "≈ ¥800 per day, two swaps and one cut", zh: "每天约 ¥800，两处替换一处删减" } },
    ],
    diff: {
      summary: { en: "3 changes waiting for you", zh: "3 处改动待确认" },
      entries: [
        { id: "bg1", op: "move", target: { en: "Day 2 dinner", zh: "Day 2 晚餐" }, detail: { en: "Fine dining swapped for a mid-range set menu", zh: "精品餐厅换成中档套餐" }, reason: { en: "Saves about ¥260 without losing the cuisine", zh: "省约 ¥260 且保留同一菜系" }, trigger: { en: "You lowered the daily budget", zh: "你下调了每日预算" } },
        { id: "bg2", op: "move", target: { en: "Day 3 taxi", zh: "Day 3 打车" }, detail: { en: "Replaced with metro plus a 9-minute walk", zh: "换成地铁加 9 分钟步行" }, reason: { en: "Saves about ¥70 and stays inside your walking range", zh: "省约 ¥70 且仍在你的步行范围内" }, trigger: { en: "From your profile · walking 7–9k steps", zh: "来自画像 · 步行 7,000–9,000 步" } },
        { id: "bg3", op: "remove", target: { en: "Second paid museum", zh: "第二个收费美术馆" }, detail: { en: "Kept the one you rated higher", zh: "保留你评价更高的那个" }, reason: { en: "Two paid museums in one day exceeded the new band", zh: "同日两个收费馆超出新的预算区间" }, trigger: { en: "You lowered the daily budget", zh: "你下调了每日预算" } },
      ],
    },
    days: [
      {
        id: "bg1",
        label: { en: "Day 2, rebalanced", zh: "Day 2，已重排" },
        summary: { walk: { en: "Walking 7.1 km", zh: "步行 7.1 km" }, nodes: { en: "4 main stops", zh: "主要节点 4 个" }, budget: { en: "≈ ¥800", zh: "约 ¥800" }, indoor: { en: "Indoor 45%", zh: "室内 45%" } },
        nodes: [
          { id: "bg-walk", time: "09:40", kind: "sight", state: "confirmed", confidence: "high", title: { en: "Lane walk, unchanged", zh: "街区步行，未改动" }, duration: { en: "1 h 15 m", zh: "1 小时 15 分" }, cost: { en: "Free", zh: "免费" }, map: { x: .3, y: .5 } },
          { id: "bg-metro", time: "11:10", kind: "transit", state: "proposed", confidence: "high", title: { en: "Metro instead of taxi", zh: "地铁替代打车" }, duration: { en: "26 min", zh: "26 分钟" }, cost: { en: "≈ ¥5", zh: "约 ¥5" }, map: { x: .42, y: .55 } },
          { id: "bg-museum", time: "13:30", kind: "sight", state: "confirmed", confidence: "medium", title: { en: "One paid museum kept", zh: "保留一个收费展馆" }, duration: { en: "2 h", zh: "2 小时" }, cost: { en: "≈ ¥120", zh: "约 ¥120" }, map: { x: .55, y: .6 } },
          { id: "bg-dinner", time: "18:40", kind: "food", state: "proposed", confidence: "medium", title: { en: "Mid-range set dinner", zh: "中档套餐晚餐" }, duration: { en: "1 h 20 m", zh: "1 小时 20 分" }, cost: { en: "≈ ¥150 pp", zh: "人均约 ¥150" }, map: { x: .68, y: .66 }, risks: [{ en: "Peanut-free option still confirmed", zh: "无花生选项仍然成立" }] },
        ],
      },
    ],
    bookings: [
      { id: "b-swap", label: { en: "Table", zh: "餐位" }, title: { en: "Swap Day 2 dinner", zh: "更换 Day 2 晚餐" }, state: "proposed", action: { en: "Reservation channel", zh: "预订渠道" }, feedback: { en: "Reservation handoff previewed. Nothing was booked", zh: "已展示预订跳转，未产生任何预订" } },
    ],
  },
};
