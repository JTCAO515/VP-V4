export type DestinationPreview = {
  id: string;
  name: string;
  featuredPlace: string;
  x: number;
  y: number;
};

// Coordinates are approximate positions on the abstract outline artwork.
// Featured-place strings are presentation samples only; they are not reviewed Facts.
export const destinationPreviews: readonly DestinationPreview[] = [
  { id: "beijing", name: "北京", featuredPlace: "故宫博物院", x: 75, y: 38 },
  { id: "tianjin", name: "天津", featuredPlace: "古文化街", x: 77, y: 41 },
  { id: "shijiazhuang", name: "石家庄", featuredPlace: "正定古城", x: 73, y: 44 },
  { id: "taiyuan", name: "太原", featuredPlace: "晋祠", x: 67, y: 43 },
  { id: "hohhot", name: "呼和浩特", featuredPlace: "大召寺", x: 53, y: 33 },
  { id: "shenyang", name: "沈阳", featuredPlace: "沈阳故宫", x: 82, y: 36 },
  { id: "changchun", name: "长春", featuredPlace: "伪满皇宫博物院", x: 83, y: 30 },
  { id: "harbin", name: "哈尔滨", featuredPlace: "圣索菲亚教堂", x: 83, y: 20 },
  { id: "shanghai", name: "上海", featuredPlace: "外滩", x: 87, y: 58 },
  { id: "suzhou", name: "苏州", featuredPlace: "拙政园", x: 84.5, y: 56 },
  { id: "hangzhou", name: "杭州", featuredPlace: "西湖", x: 84, y: 61 },
  { id: "huangshan", name: "黄山", featuredPlace: "黄山风景区", x: 80, y: 61 },
  { id: "xiamen", name: "厦门", featuredPlace: "鼓浪屿", x: 83, y: 70 },
  { id: "nanchang", name: "南昌", featuredPlace: "滕王阁", x: 78, y: 65 },
  { id: "jinan", name: "济南", featuredPlace: "趵突泉", x: 81, y: 47 },
  { id: "luoyang", name: "洛阳", featuredPlace: "龙门石窟", x: 73, y: 52 },
  { id: "wuhan", name: "武汉", featuredPlace: "黄鹤楼", x: 74, y: 57 },
  { id: "changsha", name: "长沙", featuredPlace: "岳麓山", x: 73, y: 64 },
  { id: "guangzhou", name: "广州", featuredPlace: "广州塔", x: 79, y: 75 },
  { id: "shenzhen", name: "深圳", featuredPlace: "深圳湾公园", x: 80, y: 77 },
  { id: "guilin", name: "桂林", featuredPlace: "漓江", x: 69, y: 74 },
  { id: "haikou", name: "海口", featuredPlace: "骑楼老街", x: 75, y: 84 },
  { id: "chongqing", name: "重庆", featuredPlace: "洪崖洞", x: 66, y: 61 },
  { id: "chengdu", name: "成都", featuredPlace: "大熊猫繁育研究基地", x: 62, y: 59 },
  { id: "jiuzhaigou", name: "九寨沟", featuredPlace: "九寨沟风景区", x: 58, y: 53 },
  { id: "guiyang", name: "贵阳", featuredPlace: "青岩古镇", x: 67, y: 69 },
  { id: "kunming", name: "昆明", featuredPlace: "石林风景区", x: 58, y: 75 },
  { id: "lhasa", name: "拉萨", featuredPlace: "布达拉宫", x: 25, y: 65 },
  { id: "xian", name: "西安", featuredPlace: "兵马俑", x: 67, y: 52 },
  { id: "lanzhou", name: "兰州", featuredPlace: "黄河风情线", x: 57, y: 48 },
  { id: "xining", name: "西宁", featuredPlace: "塔尔寺", x: 52, y: 51 },
  { id: "yinchuan", name: "银川", featuredPlace: "西夏王陵", x: 63, y: 44 },
  { id: "urumqi", name: "乌鲁木齐", featuredPlace: "国际大巴扎", x: 15, y: 36 },
  // The two Pearl River Delta controls are intentionally separated enough to remain individually selectable on mobile.
  { id: "hong-kong", name: "香港", featuredPlace: "维多利亚港", x: 80, y: 74 },
  { id: "macao", name: "澳门", featuredPlace: "大三巴牌坊", x: 73, y: 71 },
  { id: "taipei", name: "台北", featuredPlace: "故宫博物院", x: 85, y: 59 },
];
