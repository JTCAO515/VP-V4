import { createElement, type ReactElement } from "react";

import type { Locale } from "../../../lib/i18n.ts";
import type { WeatherCardOutcome } from "../../../lib/server/external-evidence/weather/projector.ts";

const copy = {
  zh: { heading: "天气观测", source: "来源", observed: "观测时间", expires: "有效至", recheck: "官方渠道复核", unavailable: "当前无法刷新天气信息", airQuality: "空气质量", alert: "预警" },
  en: { heading: "Weather observation", source: "Source", observed: "Observed", expires: "Valid until", recheck: "Check an official channel", unavailable: "Weather information is unavailable", airQuality: "Air quality", alert: "Alert" },
  es: { heading: "Observación meteorológica", source: "Fuente", observed: "Observado", expires: "Válido hasta", recheck: "Comprueba un canal oficial", unavailable: "La información meteorológica no está disponible", airQuality: "Calidad del aire", alert: "Alerta" },
  ru: { heading: "Наблюдение за погодой", source: "Источник", observed: "Наблюдение", expires: "Действительно до", recheck: "Проверьте официальный канал", unavailable: "Информация о погоде недоступна", airQuality: "Качество воздуха", alert: "Предупреждение" },
  ar: { heading: "ملاحظة الطقس", source: "المصدر", observed: "وقت الرصد", expires: "صالح حتى", recheck: "تحقق من قناة رسمية", unavailable: "معلومات الطقس غير متاحة", airQuality: "جودة الهواء", alert: "تنبيه" },
} as const;

export function WeatherObservationCard(props: Readonly<{ locale: Locale; outcome: WeatherCardOutcome }>): ReactElement {
  const labels = copy[props.locale];
  const common = { "data-weather-observation-card": "true", lang: props.locale, dir: props.locale === "ar" ? "rtl" : "ltr", "aria-label": labels.heading } as const;
  if (props.outcome.kind === "weather_unavailable") {
    return createElement("section", common, createElement("h2", null, labels.heading), createElement("p", null, labels.unavailable), createElement("p", null, labels.recheck));
  }
  const alert = props.outcome.alert === null ? null : createElement("li", { "data-weather-alert": props.outcome.alert.severity }, `${labels.alert}: ${props.outcome.alert.severity} ${props.outcome.alert.category}`);
  return createElement(
    "section",
    common,
    createElement("h2", null, labels.heading),
    createElement("p", { "data-weather-source": props.outcome.source }, `${labels.source}: ${props.outcome.source}`),
    createElement("time", { dateTime: props.outcome.observedAt }, `${labels.observed}: ${props.outcome.observedAt}`),
    createElement("time", { dateTime: props.outcome.expiresAt }, `${labels.expires}: ${props.outcome.expiresAt}`),
    createElement("ul", null, createElement("li", null, props.outcome.condition), createElement("li", null, `${labels.airQuality}: ${props.outcome.airQuality}`), alert),
    createElement("p", null, labels.recheck),
  );
}
