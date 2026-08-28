"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";
import styles from "@/components/canvas/TripCanvas.module.css";

const copy: Record<Locale, readonly [string, string, string, string, string]> = {
  zh: ["叫车协助", "Ride Assist 暂不可用", "没有 confirmed pickup、Chinese destination、provider handoff 或 authorized provider observation，因此不会收集位置、显示车型或预估、代叫、支付或声称合作。", "VisePanda 首页", "界面语言"],
  en: ["Ride Assist", "Ride Assist is unavailable", "No confirmed pickup, Chinese destination, provider handoff, or authorized provider observation is available, so no location is collected and no ride, payment, vehicle estimate, or partnership is claimed.", "VisePanda home", "Interface language"],
  es: ["Asistencia de transporte", "La asistencia de transporte no está disponible", "No hay punto de recogida confirmado, destino chino, transferencia al proveedor ni observación autorizada; no se recopila ubicación ni se afirma viaje, pago o estimación.", "Inicio de VisePanda", "Idioma de la interfaz"],
  ru: ["Помощь с поездкой", "Помощь с поездкой недоступна", "Нет подтверждённой точки посадки, китайского пункта назначения, передачи провайдеру или авторизованного наблюдения; местоположение не собирается.", "Главная VisePanda", "Язык интерфейса"],
  ar: ["مساعدة التنقّل", "مساعدة التنقّل غير متاحة", "لا توجد نقطة التقاط مؤكدة أو وجهة صينية أو تسليم لمزوّد أو ملاحظة مصرّح بها؛ لذلك لا يُجمع الموقع ولا يُدّعى طلب رحلة أو دفع أو تقدير.", "الصفحة الرئيسية لـ VisePanda", "لغة الواجهة"],
};

export function RideAssistWorkspace() {
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
