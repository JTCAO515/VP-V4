"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";
import styles from "@/components/canvas/TripCanvas.module.css";

const copy: Record<Locale, readonly [string, string, string, string, string]> = {
  zh: ["攻略导入", "攻略导入暂不可用", "没有 owner-scoped artifact storage、purpose、TTL、extraction isolation 或 correction contract，因此不会接收、保存或解析 PDF、链接或图片。", "VisePanda 首页", "界面语言"],
  en: ["Guide import", "Guide import is unavailable", "No owner-scoped artifact storage, purpose, TTL, extraction isolation, or correction contract exists, so no PDF, link, or image is accepted, retained, or parsed.", "VisePanda home", "Interface language"],
  es: ["Importación de guía", "La importación de guía no está disponible", "No existen almacenamiento de artefactos del propietario, propósito, TTL, aislamiento de extracción ni contrato de corrección; no se acepta, conserva ni analiza ningún PDF, enlace o imagen.", "Inicio de VisePanda", "Idioma de la interfaz"],
  ru: ["Импорт путеводителя", "Импорт путеводителя недоступен", "Нет хранилища артефактов владельца, цели, TTL, изоляции извлечения или контракта исправления; PDF, ссылка или изображение не принимаются, не хранятся и не разбираются.", "Главная VisePanda", "Язык интерфейса"],
  ar: ["استيراد الدليل", "استيراد الدليل غير متاح", "لا يوجد تخزين لعنصر ضمن نطاق المالك أو غرض أو TTL أو عزل للاستخراج أو عقد للتصحيح؛ لذلك لا يُقبل أو يُحتفظ أو يُحلّل أي PDF أو رابط أو صورة.", "الصفحة الرئيسية لـ VisePanda", "لغة الواجهة"],
};

export function GuideImportWorkspace() {
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
