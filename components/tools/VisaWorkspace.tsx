"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";
import styles from "@/components/canvas/TripCanvas.module.css";

const copy: Record<Locale, readonly [string, string, string, string, string]> = {
  zh: ["签证与法规", "签证指引暂不可用", "没有包含 passport、stay、region、time、authority 和 expiry scope 的 reviewed policy fact，因此不会请求个人范围、推断规则或显示官方渠道。", "VisePanda 首页", "界面语言"],
  en: ["Visa & regulations", "Visa guidance is unavailable", "No reviewed policy fact with passport, stay, region, time, authority, and expiry scope exists, so no personal scope is requested, no rule is inferred, and no official channel is shown.", "VisePanda home", "Interface language"],
  es: ["Visado y normativa", "La orientación sobre visados no está disponible", "No existe un hecho de política revisado con alcance de pasaporte, estancia, región, tiempo, autoridad y vencimiento; no se solicita información personal ni se infieren reglas.", "Inicio de VisePanda", "Idioma de la interfaz"],
  ru: ["Виза и правила", "Визовые рекомендации недоступны", "Нет проверенного правила с областью паспорта, пребывания, региона, времени, органа и срока действия; личные данные не запрашиваются и правила не выводятся.", "Главная VisePanda", "Язык интерфейса"],
  ar: ["التأشيرة واللوائح", "إرشادات التأشيرة غير متاحة", "لا توجد قاعدة سياسة مراجعة تشمل نطاق جواز السفر والإقامة والمنطقة والوقت والجهة والصلاحية؛ لذلك لا تُطلب بيانات شخصية ولا تُستنتج قواعد.", "الصفحة الرئيسية لـ VisePanda", "لغة الواجهة"],
};

export function VisaWorkspace() {
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
