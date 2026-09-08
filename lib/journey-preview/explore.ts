import type { Evidence, FactState, Localized } from "./types";

export type PoiCategory = "attractions" | "restaurants" | "hotels";
export type Support = "yes" | "no" | "partial" | "onsite";

export const SUPPORT_LABEL: Record<Support, Localized> = {
  yes: { en: "Supported", zh: "支持" },
  no: { en: "Not supported", zh: "不支持" },
  partial: { en: "Partial", zh: "部分" },
  onsite: { en: "Confirm on site", zh: "现场确认" },
};

export type Poi = {
  id: string;
  category: PoiCategory;
  art: string;
  name: Localized;
  area: Localized;
  address: Localized;
  price: Localized;
  /** 1-4, used by the price filter. */
  tier: number;
  review: Localized;
  state: FactState;
  payment: Array<{ method: Localized; value: Support; note?: Localized }>;
  language: Array<{ item: Localized; value: Localized }>;
  entry: Array<{ item: Localized; value: Localized }>;
  evidence: Evidence[];
  intlCard: boolean;
  english: boolean;
};

const P = (en: string, zh: string): Localized => ({ en, zh });
const recheck = (days: number): Localized => ({ en: `Demo recheck: ${days}d ago`, zh: `Demo 复核：${days} 天前` });

const PAY_ROWS = (visa: Support, unionpay: Support, applepay: Support, mobile: Support, cash: Support) => [
  { method: P("Visa / Mastercard", "Visa / Mastercard"), value: visa },
  { method: P("UnionPay", "银联"), value: unionpay },
  { method: P("Apple Pay", "Apple Pay"), value: applepay },
  { method: P("Mobile pay with a foreign card", "移动支付（绑定境外卡）"), value: mobile },
  { method: P("Cash", "现金"), value: cash },
];

const LANG_ROWS = (menu: Localized, staff: Localized, audio: Localized, device: Localized) => [
  { item: P("English menu or signage", "英文菜单或说明"), value: menu },
  { item: P("Staff English", "员工英语"), value: staff },
  { item: P("Audio guide languages", "语音导览语言"), value: audio },
  { item: P("Translation device", "翻译设备"), value: device },
];

export const POIS: Poi[] = [
  {
    id: "bund", category: "attractions", art: "bund", tier: 1, intlCard: true, english: true, state: "confirmed",
    name: P("The Bund", "外滩"),
    area: P("Huangpu riverfront", "黄浦江滨水区"),
    address: P("Zhongshan East 1st Road, Huangpu, Shanghai", "上海市黄浦区中山东一路"),
    price: P("Public space, free", "公共空间，免费"),
    review: P("Strongest at sunrise or once the skyline lights come on. Midday is the most crowded.", "日出前后或天际线亮灯后最好看，正午人最多。"),
    payment: PAY_ROWS("yes", "yes", "yes", "partial", "yes"),
    language: LANG_ROWS(P("Bilingual signage", "中英文标识"), P("Limited", "有限"), P("None", "无"), P("Not provided", "不提供")),
    entry: [
      { item: P("Reservation", "预约"), value: P("Not required", "无需预约") },
      { item: P("Passport", "护照"), value: P("Not required", "无需出示") },
      { item: P("Best window", "最佳时段"), value: P("Before 09:30 or after 19:00", "09:30 前或 19:00 后") },
    ],
    evidence: [{ kind: "official", label: P("Riverfront management notice", "滨江管理方公告"), checked: recheck(3), validity: P("Valid this season", "本季有效") }],
  },
  {
    id: "yuyuan", category: "attractions", art: "yuyuan", tier: 2, intlCard: false, english: false, state: "recheck",
    name: P("Yu Garden", "豫园"),
    area: P("Old City · Huangpu", "黄浦老城厢"),
    address: P("Anren Street, Huangpu, Shanghai", "上海市黄浦区安仁街"),
    price: P("Ticketed · recheck the current price", "需购票 · 价格待复核"),
    review: P("Allow time for the garden and the surrounding lanes together; the two are usually visited as one stop.", "建议把园林和周边街巷算作一个整体来安排时间。"),
    payment: PAY_ROWS("onsite", "yes", "onsite", "partial", "yes"),
    language: LANG_ROWS(P("Partial", "部分"), P("Limited", "有限"), P("Recheck", "需复核"), P("Recheck", "需复核")),
    entry: [
      { item: P("Reservation", "预约"), value: P("A timed window may apply · recheck", "可能需要预约时段 · 需复核") },
      { item: P("Passport", "护照"), value: P("Recheck", "需复核") },
      { item: P("Closed day", "闭园日"), value: P("Recheck before you go", "出发前复核") },
    ],
    evidence: [{ kind: "official", label: P("Ticketing page", "票务页面"), checked: recheck(9) }],
  },
  {
    id: "shanghai-museum", category: "attractions", art: "shanghai-museum", tier: 2, intlCard: true, english: true, state: "recheck",
    name: P("Shanghai Museum East", "上海博物馆东馆"),
    area: P("Pudong", "浦东新区"),
    address: P("Century Avenue, Pudong, Shanghai", "上海市浦东新区世纪大道"),
    price: P("Reservation may be required", "可能需要预约"),
    review: P("Pick two or three galleries before arriving; the building is large enough that wandering costs a whole afternoon.", "到馆前先选两三个展厅；场馆很大，随意走会耗掉整个下午。"),
    payment: PAY_ROWS("yes", "yes", "yes", "partial", "no"),
    language: LANG_ROWS(P("Bilingual labels", "中英文说明"), P("Available at the desk", "服务台可沟通"), P("Multiple languages", "多语种"), P("Available on deposit", "可押金租借")),
    entry: [
      { item: P("Reservation", "预约"), value: P("Required · timed entry", "需要 · 分时入场") },
      { item: P("Passport", "护照"), value: P("Required at entry", "入场需出示") },
      { item: P("Exhibition rotation", "换展"), value: P("May change opening hours", "可能改变开放时间") },
    ],
    evidence: [{ kind: "official", label: P("Exhibition page", "展览页面"), checked: recheck(21) }],
  },
  {
    id: "nanxiang", category: "restaurants", art: "nanxiang", tier: 2, intlCard: false, english: false, state: "proposed",
    name: P("Nanxiang Mantou Dian", "南翔馒头店"),
    area: P("Yu Garden area", "豫园区域"),
    address: P("Yuyuan Old Street, Huangpu, Shanghai", "上海市黄浦区豫园老街"),
    price: P("¥¥ · about ¥90 per person", "¥¥ · 人均约 ¥90"),
    review: P("Known for xiaolongbao. Peak queues can take enough time to affect the rest of the afternoon.", "这里以小笼包闻名。高峰期排队时间较长，可能影响下午的其他安排。"),
    payment: PAY_ROWS("onsite", "yes", "no", "yes", "yes"),
    language: LANG_ROWS(P("Picture menu", "图片菜单"), P("Limited", "有限"), P("None", "无"), P("Not provided", "不提供")),
    entry: [
      { item: P("Reservation", "预约"), value: P("Not accepted · queue only", "不接受预约 · 只能排队") },
      { item: P("Peak queue", "高峰排队"), value: P("30–45 min", "30–45 分钟") },
      { item: P("Peanut", "花生"), value: P("Present in some fillings · confirm", "部分馅料含花生 · 需确认") },
    ],
    evidence: [{ kind: "platform", label: P("Public listing", "公开平台信息"), checked: recheck(5) }],
  },
  {
    id: "laozhengxing", category: "restaurants", art: "laozhengxing", tier: 3, intlCard: false, english: false, state: "confirmed",
    name: P("Lao Zheng Xing", "老正兴"),
    area: P("Huangpu", "黄浦区"),
    address: P("Fuzhou Road, Huangpu, Shanghai", "上海市黄浦区福州路"),
    price: P("¥¥¥ · about ¥180 per person", "¥¥¥ · 人均约 ¥180"),
    review: P("Classic sweet-savoury Shanghai flavours. Ask about allergens before ordering.", "典型本帮菜口味，偏咸甜。点餐前先确认过敏原。"),
    payment: PAY_ROWS("onsite", "yes", "no", "yes", "yes"),
    language: LANG_ROWS(P("Partial English menu", "部分英文菜单"), P("Limited", "有限"), P("None", "无"), P("Not provided", "不提供")),
    entry: [
      { item: P("Reservation", "预约"), value: P("Recommended for dinner", "晚餐建议预约") },
      { item: P("Peanut", "花生"), value: P("Two house dishes contain it", "两道招牌菜含花生") },
      { item: P("Set menu", "套餐"), value: P("Peanut-free option available", "有无花生选项") },
    ],
    evidence: [{ kind: "platform", label: P("Menu listing", "菜单信息"), checked: recheck(4) }],
  },
  {
    id: "fu1088", category: "restaurants", art: "fu1088", tier: 4, intlCard: true, english: true, state: "confirmed",
    name: P("Fu 1088", "福 1088"),
    area: P("Jing'an", "静安区"),
    address: P("Zhenning Road, Jing'an, Shanghai", "上海市静安区镇宁路"),
    price: P("¥¥¥¥ · about ¥420 per person", "¥¥¥¥ · 人均约 ¥420"),
    review: P("A slow, private-room dinner. Reservation timing matters more than the menu choice.", "适合节奏慢的包房晚餐。预约时间比选菜更关键。"),
    payment: PAY_ROWS("yes", "yes", "yes", "yes", "yes"),
    language: LANG_ROWS(P("English menu", "英文菜单"), P("Available", "可沟通"), P("None", "无"), P("Not provided", "不提供")),
    entry: [
      { item: P("Reservation", "预约"), value: P("Required · private rooms only", "必须预约 · 仅包房") },
      { item: P("Minimum spend", "低消"), value: P("Applies per room · confirm when booking", "按包房计 · 预订时确认") },
      { item: P("Peanut", "花生"), value: P("Can be excluded on request", "可要求全程避开") },
    ],
    evidence: [{ kind: "platform", label: P("Reservation listing", "预订信息"), checked: recheck(6) }],
  },
  {
    id: "peace-hotel", category: "hotels", art: "peace-hotel", tier: 4, intlCard: true, english: true, state: "confirmed",
    name: P("Fairmont Peace Hotel", "上海和平饭店"),
    area: P("The Bund", "外滩"),
    address: P("Nanjing East Road, Huangpu, Shanghai", "上海市黄浦区南京东路"),
    price: P("Luxury · above your usual band", "豪华 · 高于你的常规区间"),
    review: P("Convenient for Bund walks. Room views vary a lot, so compare before you commit.", "适合外滩步行。不同房型景观差别很大，订前先比较。"),
    payment: PAY_ROWS("yes", "yes", "yes", "yes", "yes"),
    language: LANG_ROWS(P("Full English", "全英文"), P("Available", "可沟通"), P("Not applicable", "不适用"), P("Not applicable", "不适用")),
    entry: [
      { item: P("Check-in", "入住"), value: P("Passport required", "需出示护照") },
      { item: P("Cancellation", "取消政策"), value: P("Varies by rate · confirm before booking", "因房价而异 · 预订前确认") },
      { item: P("Quiet side", "安静侧"), value: P("Request at booking", "预订时提出") },
    ],
    evidence: [{ kind: "platform", label: P("Property listing", "酒店信息页"), checked: recheck(6) }],
  },
  {
    id: "edition", category: "hotels", art: "edition", tier: 4, intlCard: true, english: true, state: "proposed",
    name: P("The Shanghai EDITION", "上海艾迪逊酒店"),
    area: P("Nanjing East Road", "南京东路"),
    address: P("Nanjing East Road, Huangpu, Shanghai", "上海市黄浦区南京东路"),
    price: P("Luxury · above your usual band", "豪华 · 高于你的常规区间"),
    review: P("Central and lively, but the nightlife may not suit a traveller looking for a quiet room.", "位置中心，周边也很热闹。如果你更在意安静，订房前要留意房间位置。"),
    payment: PAY_ROWS("yes", "yes", "yes", "yes", "yes"),
    language: LANG_ROWS(P("Full English", "全英文"), P("Available", "可沟通"), P("Not applicable", "不适用"), P("Not applicable", "不适用")),
    entry: [
      { item: P("Check-in", "入住"), value: P("Passport required", "需出示护照") },
      { item: P("Noise", "噪音"), value: P("Rooftop venues run late · ask for a lower floor", "顶层场地营业到很晚 · 可要求低楼层") },
      { item: P("Cancellation", "取消政策"), value: P("Varies by rate", "因房价而异") },
    ],
    evidence: [{ kind: "platform", label: P("Property listing", "酒店信息页"), checked: recheck(8) }],
  },
  {
    id: "capella", category: "hotels", art: "capella", tier: 4, intlCard: true, english: true, state: "confirmed",
    name: P("Capella Shanghai, Jian Ye Li", "上海建业里嘉佩乐酒店"),
    area: P("Former French Concession", "衡复风貌区"),
    address: P("Jianguo West Road, Xuhui, Shanghai", "上海市徐汇区建国西路"),
    price: P("Luxury · above your usual band", "豪华 · 高于你的常规区间"),
    review: P("Quiet lane-house setting. It is not next to a metro station, so allow more transfer time during peak hours.", "石库门街区比较安静，但酒店不在地铁口，高峰时段要多留一些交通时间。"),
    payment: PAY_ROWS("yes", "yes", "yes", "yes", "yes"),
    language: LANG_ROWS(P("Full English", "全英文"), P("Available", "可沟通"), P("Not applicable", "不适用"), P("Not applicable", "不适用")),
    entry: [
      { item: P("Check-in", "入住"), value: P("Passport required", "需出示护照") },
      { item: P("Transfer", "交通"), value: P("Add 10–15 min at peak", "高峰时段增加 10–15 分钟") },
      { item: P("Cancellation", "取消政策"), value: P("Flexible on most rates", "多数房价可灵活取消") },
    ],
    evidence: [{ kind: "platform", label: P("Property listing", "酒店信息页"), checked: recheck(6) }],
  },
];

export const EXPLORE_CITY_CARDS = [
  { id: "shanghai", name: P("Shanghai", "上海"), ready: true, count: 9, categories: P("Attractions · Restaurants · Hotels", "景点 · 餐厅 · 酒店"), updated: P("Updated 3d ago", "3 天前更新") },
  { id: "beijing", name: P("Beijing", "北京"), ready: false, count: 0, categories: P("Attractions first", "先做景点"), updated: P("In preparation", "整理中") },
  { id: "guangzhou", name: P("Guangzhou", "广州"), ready: false, count: 0, categories: P("Restaurants first", "先做餐厅"), updated: P("In preparation", "整理中") },
  { id: "shenzhen", name: P("Shenzhen", "深圳"), ready: false, count: 0, categories: P("Attractions first", "先做景点"), updated: P("In preparation", "整理中") },
];

export const DISHES = [
  {
    id: "braised-pork", art: "braised-pork",
    name: P("Braised pork belly", "红烧肉"),
    taste: P("Sweet-savoury, slow braised, rich", "咸甜口，慢炖，浓郁"),
    ingredients: P("Pork belly, soy sauce, rock sugar, rice wine", "五花肉、酱油、冰糖、料酒"),
    allergens: P("Contains soy and wheat · no peanut", "含大豆与小麦 · 不含花生"),
    pairing: P("Pairs with plain rice and a light green vegetable", "配白米饭和一道清炒时蔬"),
    price: P("¥68 · included in the ¥168 set", "¥68 · 已含在 ¥168 套餐内"),
    safe: true,
  },
  {
    id: "scallion-noodles", art: "scallion-noodles",
    name: P("Scallion oil noodles", "葱油拌面"),
    taste: P("Savoury, aromatic, served warm not hot", "咸香，温热而非滚烫"),
    ingredients: P("Wheat noodles, scallion, soy sauce, oil", "小麦面条、葱、酱油、油"),
    allergens: P("Contains wheat and soy · no peanut", "含小麦与大豆 · 不含花生"),
    pairing: P("Good alongside the braised pork", "适合与红烧肉搭配"),
    price: P("¥28 · included in the ¥168 set", "¥28 · 已含在 ¥168 套餐内"),
    safe: true,
  },
  {
    id: "cold-chicken", art: "dish-generic",
    name: P("Cold chicken in sauce", "白斩鸡配酱汁"),
    taste: P("Cool, savoury, sauce served separately", "凉菜，咸鲜，酱汁另配"),
    ingredients: P("Chicken, soy, sesame, ground peanut in the sauce", "鸡肉、酱油、芝麻，酱汁含花生碎"),
    allergens: P("Contains peanut in the sauce", "酱汁含花生"),
    pairing: P("Ask for the sauce on the side, or skip this one", "可要求酱汁另放，或直接跳过"),
    price: P("¥58", "¥58"),
    safe: false,
  },
];
