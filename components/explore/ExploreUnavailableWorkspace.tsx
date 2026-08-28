"use client";

import { useEffect, useState } from "react";

import { getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";
import styles from "./ExploreUnavailableWorkspace.module.css";

type RouteKind = "index" | "city" | "poi";

const copy: Readonly<Record<Locale, Readonly<{ title: string; body: string; unavailable: string; returnToProduct: string; language: string; kicker: string; route: Record<RouteKind, string> }>>> = {
  zh: { title: "从一座城市开始探索", body: "此处只会展示来自已审核、未过期且许可允许的统一地点投影。当前尚无可公开的城市或地点资料。", unavailable: "探索暂不可用", returnToProduct: "返回 VisePanda", language: "界面语言", kicker: "金色路线", route: { index: "城市探索", city: "城市资料", poi: "地点资料" } },
  en: { title: "Explore one city at a time", body: "This surface can show only one reviewed, current, licence-allowed place projection. No public city or place record is available yet.", unavailable: "Explore is unavailable", returnToProduct: "Back to VisePanda", language: "Interface language", kicker: "Golden Route", route: { index: "City Explore", city: "City record", poi: "Place record" } },
  es: { title: "Explora una ciudad a la vez", body: "Esta superficie solo puede mostrar una proyección de lugares revisada, vigente y autorizada. Aún no hay registros públicos de ciudades o lugares.", unavailable: "Explorar no está disponible", returnToProduct: "Volver a VisePanda", language: "Idioma de la interfaz", kicker: "Ruta dorada", route: { index: "Explorar ciudades", city: "Registro de ciudad", poi: "Registro de lugar" } },
  ru: { title: "Исследуйте по одному городу", body: "Здесь может отображаться только единая проверенная, актуальная и разрешённая проекция мест. Публичных записей городов или мест пока нет.", unavailable: "Explore недоступен", returnToProduct: "Вернуться в VisePanda", language: "Язык интерфейса", kicker: "Золотой маршрут", route: { index: "Города", city: "Карточка города", poi: "Карточка места" } },
  ar: { title: "استكشف مدينة واحدة في كل مرة", body: "لا تعرض هذه الواجهة إلا إسقاطاً موحداً للأماكن تمت مراجعته وما زال صالحاً ومسموحاً به. لا تتوفر سجلات عامة للمدن أو الأماكن بعد.", unavailable: "الاستكشاف غير متاح", returnToProduct: "العودة إلى VisePanda", language: "لغة الواجهة", kicker: "المسار الذهبي", route: { index: "استكشاف المدن", city: "سجل المدينة", poi: "سجل المكان" } },
};

export function ExploreUnavailableWorkspace({ route }: Readonly<{ route: RouteKind }>) {
  const [locale, setLocale] = useState<Locale>("zh");
  const content = copy[locale];

  useEffect(() => {
    const attributes = getLocaleAttributes(locale);
    document.documentElement.lang = attributes.lang;
    document.documentElement.dir = attributes.dir;
    document.title = `VisePanda | ${content.route[route]}`;
  }, [content.route, locale, route]);

  return <main className={styles.page} data-locale={locale}>
    <header className={styles.header}>
      <a className={styles.wordmark} href="/" aria-label={content.returnToProduct}>VisePanda.</a>
      <label className={styles.localeLabel}><span>{content.language}</span><select aria-label={content.language} onChange={(event) => setLocale(event.target.value as Locale)} value={locale}>{localeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    </header>
    <section className={styles.panel} aria-labelledby="explore-title">
      <p className={styles.kicker}>{content.kicker} · {content.route[route]}</p>
      <p className={styles.state}>{content.unavailable}</p>
      <h1 id="explore-title">{content.title}</h1>
      <p>{content.body}</p>
      <a className={styles.returnAction} href="/visepanda">{content.returnToProduct} <span aria-hidden="true">↗</span></a>
    </section>
  </main>;
}
