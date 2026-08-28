"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";
import styles from "@/components/canvas/TripCanvas.module.css";

const copy: Record<Locale, readonly [string, string, string, string, string]> = {
  zh: ["网络准备", "网络准备暂不可用", "没有 reviewed connectivity guide、fact、coverage boundary 或 proposal capability，因此不会显示 eSIM、当地号码、价格或覆盖结论，也不会写入 Trip。", "VisePanda 首页", "界面语言"],
  en: ["Network preparation", "Network preparation is unavailable", "No reviewed connectivity guide, fact, coverage boundary, or proposal capability exists, so no eSIM, local-number, price, coverage, or Trip change is shown.", "VisePanda home", "Interface language"],
  es: ["Preparación de conexión", "La preparación de conexión no está disponible", "No existe guía, hecho, límite de cobertura ni capacidad de propuesta revisados; no se muestra eSIM, número local, precio, cobertura ni cambio de viaje.", "Inicio de VisePanda", "Idioma de la interfaz"],
  ru: ["Подготовка связи", "Подготовка связи недоступна", "Нет проверенного руководства, факта, границы покрытия или возможности предложения; eSIM, местный номер, цена, покрытие и изменение поездки не показываются.", "Главная VisePanda", "Язык интерфейса"],
  ar: ["إعداد الاتصال", "إعداد الاتصال غير متاح", "لا يوجد دليل أو حقيقة أو حد تغطية أو قدرة اقتراح مراجعة؛ لذلك لا تظهر eSIM أو رقم محلي أو سعر أو تغطية أو تغيير للرحلة.", "الصفحة الرئيسية لـ VisePanda", "لغة الواجهة"],
};

export function NetworkWorkspace() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [eyebrow, title, body, home, language] = copy[locale];

  useEffect(() => {
    const attributes = getLocaleAttributes(locale);
    document.documentElement.lang = attributes.lang;
    document.documentElement.dir = attributes.dir;
  }, [locale]);

  return <div className={styles.shell}>
    <header className={styles.header}>
      <Link className={styles.brand} href="/visepanda" aria-label={home}><VisePandaMark /></Link>
      <select aria-label={language} value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
        {localeOptions.map((option) => <option key={option.value} value={option.value}>{option.flag} {option.label}</option>)}
      </select>
    </header>
    <main className={styles.main}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1 className={styles.title}>{title}</h1>
      <section className={styles.status} aria-live="polite"><p>{body}</p></section>
    </main>
  </div>;
}
