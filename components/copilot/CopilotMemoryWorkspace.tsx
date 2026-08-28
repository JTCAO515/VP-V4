"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";
import styles from "@/components/canvas/TripCanvas.module.css";

const copy: Record<Locale, readonly [string, string, string, string, string, string, string]> = { zh: ["Copilot", "记忆治理", "记忆治理暂不可用", "在存在 owner-scoped 的持久 Memory receipt 前，不显示任何记忆、来源、影响或治理操作。此页面不会推断偏好，也不会伪造确认、拒绝、暂停、遗忘或删除已经发生。", "返回 VisePanda", "VisePanda 首页", "界面语言"], en: ["Copilot", "Memory governance", "Memory governance is unavailable", "No memory item, source, impact, or governance action is shown until owner-scoped durable Memory receipts exist. This page does not infer preferences or pretend that confirm, reject, pause, forget, or delete has happened.", "Back to VisePanda", "VisePanda home", "Interface language"], es: ["Copilot", "Gobernanza de memoria", "La gobernanza de memoria no está disponible", "No se muestra ninguna memoria, fuente, impacto ni acción de gestión hasta que existan recibos de memoria persistentes y con alcance del propietario.", "Volver a VisePanda", "Inicio de VisePanda", "Idioma de la interfaz"], ru: ["Copilot", "Управление памятью", "Управление памятью недоступно", "Пока не существуют постоянные квитанции памяти с областью владельца, не показываются элементы памяти, источники, влияние или действия управления.", "Назад к VisePanda", "Главная VisePanda", "Язык интерфейса"], ar: ["Copilot", "إدارة الذاكرة", "إدارة الذاكرة غير متاحة", "لا تظهر أي ذاكرة أو مصدر أو أثر أو إجراء إدارة إلى أن تتوفر إيصالات ذاكرة دائمة ضمن نطاق المالك.", "العودة إلى VisePanda", "الصفحة الرئيسية لـ VisePanda", "لغة الواجهة"] };

export function CopilotMemoryWorkspace() {
  const [locale, setLocale] = useState<Locale>("zh"); const [eyebrow, title, unavailable, body, back, home, language] = copy[locale];
  useEffect(() => { const attributes = getLocaleAttributes(locale); document.documentElement.lang = attributes.lang; document.documentElement.dir = attributes.dir; }, [locale]);
  return <div className={styles.shell}><header className={styles.header}><Link className={styles.brand} href="/visepanda" aria-label={home}><VisePandaMark /></Link><Link className={styles.back} href="/visepanda">{back}</Link><select aria-label={language} value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>{localeOptions.map((option) => <option key={option.value} value={option.value}>{option.flag} {option.label}</option>)}</select></header><main className={styles.main}><p className={styles.eyebrow}>{eyebrow}</p><h1 className={styles.title}>{title}</h1><section className={styles.status} aria-live="polite"><h2>{unavailable}</h2><p>{body}</p></section></main></div>;
}
