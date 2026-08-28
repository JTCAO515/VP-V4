"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";
import styles from "@/components/canvas/TripCanvas.module.css";

const copy: Record<Locale, readonly [string, string, string, string, string]> = {
  zh: ["离线包", "离线包暂不可用", "没有 encrypted owner-isolated cache、expiry record、logout cleanup 或 deletion cleanup，因此不会保存或显示 Trip、地址卡、安全短语或过期状态，也不将缓存当作实时信息。", "VisePanda 首页", "界面语言"],
  en: ["Offline pack", "Offline pack is unavailable", "No encrypted owner-isolated cache, expiry record, logout cleanup, or deletion cleanup exists, so no Trip, address card, Safe Phrase, or expiry state is stored or shown and no cache is presented as live information.", "VisePanda home", "Interface language"],
  es: ["Paquete sin conexión", "El paquete sin conexión no está disponible", "No existen caché cifrada y aislada por propietario, registro de vencimiento ni limpieza al cerrar sesión o eliminar; no se guarda ni muestra viaje, tarjeta de dirección, frase segura ni estado de vencimiento.", "Inicio de VisePanda", "Idioma de la interfaz"],
  ru: ["Офлайн-пакет", "Офлайн-пакет недоступен", "Нет зашифрованного изолированного кэша владельца, записи срока действия или очистки при выходе и удалении; поездка, карточка адреса, безопасная фраза и срок действия не сохраняются и не показываются.", "Главная VisePanda", "Язык интерфейса"],
  ar: ["حزمة دون اتصال", "الحزمة دون اتصال غير متاحة", "لا يوجد تخزين مؤقت مشفّر ومعزول حسب المالك أو سجل انتهاء أو تنظيف عند تسجيل الخروج أو الحذف؛ لذلك لا تُحفظ أو تظهر الرحلة أو بطاقة العنوان أو العبارة الآمنة أو حالة الانتهاء.", "الصفحة الرئيسية لـ VisePanda", "لغة الواجهة"],
};

export function OfflineWorkspace() {
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
