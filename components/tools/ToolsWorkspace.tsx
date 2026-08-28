"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";
import styles from "@/components/canvas/TripCanvas.module.css";

const copy: Record<Locale, readonly [string, string, string, string, string]> = {
  zh: ["工具", "工具状态暂不可用", "没有 provider health observation、offline cache 或 authorized tool call，因此不会显示 healthy、degraded 或 offline 状态，也不会展示 Tool Card 或 Proposal。", "VisePanda 首页", "界面语言"],
  en: ["Tools", "Tool status is unavailable", "No provider health observation, offline cache, or authorized tool call is available, so no healthy, degraded, or offline state, Tool Card, or Proposal is shown.", "VisePanda home", "Interface language"],
  es: ["Herramientas", "El estado de las herramientas no está disponible", "No hay observación de salud del proveedor, caché sin conexión ni llamada autorizada; no se muestra estado, tarjeta ni propuesta.", "Inicio de VisePanda", "Idioma de la interfaz"],
  ru: ["Инструменты", "Состояние инструментов недоступно", "Нет наблюдения за состоянием провайдера, офлайн-кеша или авторизованного вызова; состояние, карточка и предложение не показываются.", "Главная VisePanda", "Язык интерфейса"],
  ar: ["الأدوات", "حالة الأدوات غير متاحة", "لا توجد ملاحظة عن حالة المزوّد أو ذاكرة تخزين مؤقت دون اتصال أو استدعاء أداة مصرّح به؛ لذلك لا تظهر حالة أو بطاقة أو اقتراح.", "الصفحة الرئيسية لـ VisePanda", "لغة الواجهة"],
};

export function ToolsWorkspace() {
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
