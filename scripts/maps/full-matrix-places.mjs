// #362 full matrix source data: 10 real, well-known public places per city
// (Shanghai/Beijing/Guangzhou/Chongqing), each with zh/en/pinyin names and
// an approximate synthetic coordinate (from memory, not independently
// verified — same "public synthetic" framing used throughout scripts/maps/).
// Generates 120 search-only fixtures (10 places x 3 language variants x 4
// cities) and 40 walking-only fixtures (10 routes per city, place[i] ->
// place[i+1 mod 10], forming a closed loop so every place's coordinate is
// used exactly twice: once as an origin, once as a destination).
export const PLACES = {
  "上海市": [
    { category: "airport_terminal", zh: "上海虹桥国际机场2号航站楼", en: "Shanghai Hongqiao Airport Terminal 2", pinyin: "Shanghai Hongqiao Guoji Jichang 2 Hao Hangzhanlou", lat: 31.1975, lng: 121.3364 },
    { category: "station_exit", zh: "上海站", en: "Shanghai Railway Station", pinyin: "Shanghai Zhan", lat: 31.2497, lng: 121.4556 },
    { category: "station_exit", zh: "人民广场地铁站", en: "People's Square Metro Station", pinyin: "Renmin Guangchang Ditie Zhan", lat: 31.2323, lng: 121.4759 },
    { category: "duplicate_name_branch", zh: "星巴克南京东路店", en: "Starbucks", pinyin: "Xingbake", lat: 31.2400, lng: 121.4850 },
    { category: "scenic_entrance", zh: "外滩", en: "The Bund", pinyin: "Waitan", lat: 31.2397, lng: 121.4900 },
    { category: "scenic_entrance", zh: "东方明珠广播电视塔", en: "Oriental Pearl Tower", pinyin: "Dongfang Mingzhu Guangbo Dianshi Ta", lat: 31.2397, lng: 121.4998 },
    { category: "scenic_entrance", zh: "豫园", en: "Yu Garden", pinyin: "Yu Yuan", lat: 31.2273, lng: 121.4920 },
    { category: "scenic_entrance", zh: "上海迪士尼乐园", en: "Shanghai Disneyland", pinyin: "Shanghai Dishini Leyuan", lat: 31.1433, lng: 121.6580 },
    { category: "landmark", zh: "静安寺", en: "Jing'an Temple", pinyin: "Jing'an Si", lat: 31.2249, lng: 121.4457 },
    { category: "attraction", zh: "上海博物馆", en: "Shanghai Museum", pinyin: "Shanghai Bowuguan", lat: 31.2286, lng: 121.4757 },
  ],
  "北京市": [
    { category: "airport_terminal", zh: "北京首都国际机场3号航站楼", en: "Beijing Capital Airport Terminal 3", pinyin: "Beijing Shoudu Guoji Jichang 3 Hao Hangzhanlou", lat: 40.0640, lng: 116.6039 },
    { category: "station_exit", zh: "北京西站", en: "Beijing West Railway Station", pinyin: "Beijing Xi Zhan", lat: 39.8952, lng: 116.3226 },
    { category: "station_exit", zh: "天安门东地铁站", en: "Tiananmen East Metro Station", pinyin: "Tian'anmen Dong Ditie Zhan", lat: 39.9075, lng: 116.4008 },
    { category: "duplicate_name_branch", zh: "麦当劳王府井店", en: "McDonald's", pinyin: "Maidanglao", lat: 39.9139, lng: 116.4108 },
    { category: "scenic_entrance", zh: "天安门广场", en: "Tiananmen Square", pinyin: "Tian'anmen Guangchang", lat: 39.9055, lng: 116.3976 },
    { category: "scenic_entrance", zh: "故宫博物院", en: "The Palace Museum", pinyin: "Gugong Bowuyuan", lat: 39.9163, lng: 116.3972 },
    { category: "scenic_entrance", zh: "颐和园", en: "Summer Palace", pinyin: "Yiheyuan", lat: 39.9999, lng: 116.2755 },
    { category: "scenic_entrance", zh: "长城八达岭", en: "Great Wall at Badaling", pinyin: "Changcheng Badaling", lat: 40.3584, lng: 116.0138 },
    { category: "scenic_entrance", zh: "天坛公园", en: "Temple of Heaven", pinyin: "Tiantan Gongyuan", lat: 39.8822, lng: 116.4066 },
    { category: "landmark", zh: "王府井大街", en: "Wangfujing Street", pinyin: "Wangfujing Dajie", lat: 39.9142, lng: 116.4114 },
  ],
  "广州市": [
    { category: "airport_terminal", zh: "广州白云国际机场2号航站楼", en: "Guangzhou Baiyun Airport Terminal 2", pinyin: "Guangzhou Baiyun Guoji Jichang 2 Hao Hangzhanlou", lat: 23.3924, lng: 113.2988 },
    { category: "station_exit", zh: "广州南站", en: "Guangzhou South Railway Station", pinyin: "Guangzhou Nan Zhan", lat: 22.9910, lng: 113.2686 },
    { category: "station_exit", zh: "体育西路地铁站", en: "Tiyu Xilu Metro Station", pinyin: "Tiyu Xilu Ditie Zhan", lat: 23.1315, lng: 113.3238 },
    { category: "duplicate_name_branch", zh: "星巴克体育中心店", en: "Starbucks", pinyin: "Xingbake", lat: 23.1330, lng: 113.3250 },
    { category: "scenic_entrance", zh: "广州塔", en: "Canton Tower", pinyin: "Guangzhou Ta", lat: 23.1066, lng: 113.3245 },
    { category: "scenic_entrance", zh: "沙面岛", en: "Shamian Island", pinyin: "Shamian Dao", lat: 23.1055, lng: 113.2412 },
    { category: "scenic_entrance", zh: "陈家祠", en: "Chen Clan Academy", pinyin: "Chenjiaci", lat: 23.1275, lng: 113.2503 },
    { category: "scenic_entrance", zh: "白云山", en: "Baiyun Mountain", pinyin: "Baiyun Shan", lat: 23.1745, lng: 113.2985 },
    { category: "landmark", zh: "上下九步行街", en: "Shangxiajiu Pedestrian Street", pinyin: "Shangxiajiu Bu Xingjie", lat: 23.1170, lng: 113.2500 },
    { category: "attraction", zh: "长隆野生动物世界", en: "Chimelong Safari Park", pinyin: "Changlong Yesheng Dongwu Shijie", lat: 22.9022, lng: 113.3298 },
  ],
  "重庆市": [
    { category: "airport_terminal", zh: "重庆江北国际机场T3A航站楼", en: "Chongqing Jiangbei Airport Terminal 3A", pinyin: "Chongqing Jiangbei Guoji Jichang T3A Hangzhanlou", lat: 29.7192, lng: 106.6417 },
    { category: "station_exit", zh: "重庆北站", en: "Chongqing North Railway Station", pinyin: "Chongqing Bei Zhan", lat: 29.6011, lng: 106.5313 },
    { category: "chongqing_complex_walking", zh: "李子坝轻轨站", en: "Liziba Monorail Station", pinyin: "Lizi Ba Qinggui Zhan", lat: 29.5615, lng: 106.5334 },
    { category: "duplicate_name_branch", zh: "星巴克解放碑店", en: "Starbucks", pinyin: "Xingbake", lat: 29.5580, lng: 106.5775 },
    { category: "scenic_entrance", zh: "解放碑", en: "Jiefangbei", pinyin: "Jiefangbei", lat: 29.5566, lng: 106.5762 },
    { category: "chongqing_complex_walking", zh: "洪崖洞", en: "Hongya Cave", pinyin: "Hongyadong", lat: 29.5628, lng: 106.5789 },
    { category: "scenic_entrance", zh: "磁器口古镇", en: "Ciqikou Ancient Town", pinyin: "Ciqikou Guzhen", lat: 29.5687, lng: 106.4573 },
    { category: "chongqing_complex_walking", zh: "长江索道", en: "Yangtze River Cableway", pinyin: "Changjiang Suodao", lat: 29.5537, lng: 106.5843 },
    { category: "landmark", zh: "三峡广场", en: "Sanxia Square", pinyin: "Sanxia Guangchang", lat: 29.5462, lng: 106.5089 },
    { category: "chongqing_complex_walking", zh: "南山一棵树观景台", en: "Nanshan Yikeshu Viewpoint", pinyin: "Nanshan Yikeshu Guanjingtai", lat: 29.5289, lng: 106.6089 },
  ],
};
