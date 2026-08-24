import type { Locale } from "@/lib/i18n";

type MapPreviewCopy = {
  eyebrow: string;
  featuredLabel: string;
  weatherLabel: string;
  weatherUnavailable: string;
  source: string;
  sampleNotice: string;
  mapAlt: string;
  markerLabel: (name: string) => string;
};

export const mapPreviewCopy: Record<Locale, MapPreviewCopy> = {
  zh: {
    eyebrow: "首批目的地 · 产品预览",
    featuredLabel: "精选地点",
    weatherLabel: "旅行提示",
    weatherUnavailable: "城市探索",
    source: "中国目的地 · 探索灵感",
    sampleNotice: "地点为产品预览示例，天气尚未接入。",
    mapAlt: "抽象中国轮廓，带可选择的目的地点位。",
    markerLabel: (name) => `查看${name}目的地预览`,
  },
  en: {
    eyebrow: "FIRST DESTINATIONS · PRODUCT PREVIEW",
    featuredLabel: "Featured place",
    weatherLabel: "Travel cue",
    weatherUnavailable: "City discovery",
    source: "China destinations · Travel inspiration",
    sampleNotice: "Places are preview samples; live weather is not connected.",
    mapAlt: "An abstract China outline with selectable destination markers.",
    markerLabel: (name) => `View ${name} destination preview`,
  },
  es: {
    eyebrow: "DESTINOS INICIALES · VISTA PREVIA",
    featuredLabel: "Lugar destacado",
    weatherLabel: "Idea de viaje",
    weatherUnavailable: "Explorar la ciudad",
    source: "Destinos en China · Inspiración de viaje",
    sampleNotice: "Los lugares son ejemplos de vista previa; el clima en vivo no está conectado.",
    mapAlt: "Un contorno abstracto de China con marcadores de destinos seleccionables.",
    markerLabel: (name) => `Ver vista previa del destino ${name}`,
  },
  ru: {
    eyebrow: "ПЕРВЫЕ НАПРАВЛЕНИЯ · ПРЕДПРОСМОТР",
    featuredLabel: "Выбранное место",
    weatherLabel: "Подсказка для поездки",
    weatherUnavailable: "Открыть город",
    source: "Направления Китая · Вдохновение для поездки",
    sampleNotice: "Места показаны для предварительного просмотра; погода пока не подключена.",
    mapAlt: "Абстрактный контур Китая с выбираемыми маркерами направлений.",
    markerLabel: (name) => `Посмотреть направление ${name}`,
  },
  ar: {
    eyebrow: "وجهات البداية · معاينة المنتج",
    featuredLabel: "مكان مختار",
    weatherLabel: "فكرة للرحلة",
    weatherUnavailable: "استكشاف المدينة",
    source: "وجهات الصين · إلهام للرحلة",
    sampleNotice: "الأماكن أمثلة للمعاينة، والطقس المباشر غير متصل.",
    mapAlt: "مخطط مجرد للصين مع علامات وجهات قابلة للاختيار.",
    markerLabel: (name) => `عرض معاينة وجهة ${name}`,
  },
};
