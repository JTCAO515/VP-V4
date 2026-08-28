"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";
import styles from "@/components/canvas/TripCanvas.module.css";

const copy: Record<Locale, readonly [string, string, string, string, string]> = {
  zh: ["攻略冲突检查", "攻略冲突检查暂不可用", "没有 imported fields、current Trip、eligible facts 或 editable Proposal contract，因此不会显示冲突、证据、unknown 或 Diff，也不会修改 Trip。", "VisePanda 首页", "界面语言"],
  en: ["Guide conflict check", "Guide conflict check is unavailable", "No imported fields, current Trip, eligible facts, or editable Proposal contract exists, so no conflict, evidence, unknown, or Diff is shown and no Trip is changed.", "VisePanda home", "Interface language"],
  es: ["Comprobación de conflictos de guía", "La comprobación de conflictos de guía no está disponible", "No existen campos importados, viaje actual, hechos aptos ni contrato de propuesta editable; no se muestran conflictos, evidencia, desconocidos ni diferencias, y el viaje no cambia.", "Inicio de VisePanda", "Idioma de la interfaz"],
  ru: ["Проверка конфликтов путеводителя", "Проверка конфликтов путеводителя недоступна", "Нет импортированных полей, текущей поездки, подходящих фактов или редактируемого контракта предложения; конфликты, доказательства, неизвестные и различия не показываются, поездка не меняется.", "Главная VisePanda", "Язык интерфейса"],
  ar: ["فحص تعارض الدليل", "فحص تعارض الدليل غير متاح", "لا توجد حقول مستوردة أو رحلة حالية أو حقائق مؤهلة أو عقد اقتراح قابل للتحرير؛ لذلك لا يظهر تعارض أو دليل أو مجهول أو فرق ولا تتغير الرحلة.", "الصفحة الرئيسية لـ VisePanda", "لغة الواجهة"],
};

export function GuideConflictWorkspace() {
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
