"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";
import styles from "@/components/canvas/TripCanvas.module.css";

const copy: Record<Locale, readonly [string, string, string, string, string]> = {
  zh: ["安全短语", "安全短语暂不可用", "没有 reviewed deterministic phrase、provenance、expiry 或 offline eligibility，因此不显示地址、问路或过敏文本，也不会播放 TTS。", "VisePanda 首页", "界面语言"],
  en: ["Safe Phrase", "Safe Phrase is unavailable", "No reviewed deterministic phrase, provenance, expiry, or offline eligibility exists, so no address, direction, or allergy text is shown and no TTS is played.", "VisePanda home", "Interface language"],
  es: ["Frase segura", "La frase segura no está disponible", "No existe una frase determinista revisada, procedencia, vencimiento ni elegibilidad sin conexión; no se muestra texto ni se reproduce TTS.", "Inicio de VisePanda", "Idioma de la interfaz"],
  ru: ["Безопасная фраза", "Безопасная фраза недоступна", "Нет проверенной детерминированной фразы, происхождения, срока действия или офлайн-доступности; текст и TTS не предоставляются.", "Главная VisePanda", "Язык интерфейса"],
  ar: ["عبارة آمنة", "العبارة الآمنة غير متاحة", "لا توجد عبارة حتمية مراجعة أو مصدر أو تاريخ انتهاء أو أهلية دون اتصال؛ لذلك لا يظهر نص ولا يُشغّل TTS.", "الصفحة الرئيسية لـ VisePanda", "لغة الواجهة"],
};

export function SafePhraseWorkspace() {
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
