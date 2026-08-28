"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";
import styles from "@/components/canvas/TripCanvas.module.css";

const copy: Record<Locale, readonly [string, string, string, string, string]> = {
  zh: ["人工交接", "Human Handoff 暂不可用", "没有 owner-scoped Trip context、selected city and problem、attempted steps 或 operator capacity，因此不会生成交接包、发送消息或声称真人服务。紧急情况请使用当地官方紧急渠道。", "VisePanda 首页", "界面语言"],
  en: ["Human Handoff", "Human Handoff is unavailable", "No owner-scoped Trip context, selected city and problem, attempted steps, or operator capacity exists, so no handoff pack is generated, no message is sent, and no human service is claimed. For an emergency, use local official emergency channels.", "VisePanda home", "Interface language"],
  es: ["Derivación humana", "La derivación humana no está disponible", "No existen contexto de viaje del propietario, ciudad y problema seleccionados, pasos intentados ni capacidad operativa; no se genera paquete, no se envía mensaje ni se afirma servicio humano. En una emergencia, usa canales oficiales locales.", "Inicio de VisePanda", "Idioma de la interfaz"],
  ru: ["Передача человеку", "Передача человеку недоступна", "Нет контекста поездки владельца, выбранных города и проблемы, предпринятых шагов или мощности оператора; пакет не создаётся, сообщение не отправляется и человеческая служба не заявляется. В экстренной ситуации используйте местные официальные каналы.", "Главная VisePanda", "Язык интерфейса"],
  ar: ["التسليم البشري", "التسليم البشري غير متاح", "لا يوجد سياق رحلة ضمن نطاق المالك أو مدينة ومشكلة محددتان أو خطوات مجرّبة أو قدرة تشغيلية؛ لذلك لا تُنشأ حزمة ولا تُرسل رسالة ولا يُدّعى توفر خدمة بشرية. في الطوارئ استخدم القنوات الرسمية المحلية.", "الصفحة الرئيسية لـ VisePanda", "لغة الواجهة"],
};

export function HandoffWorkspace() {
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
