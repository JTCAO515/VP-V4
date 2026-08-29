"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";
import { selectTripNextAction, type TodayDay, type TodayTrip, type TripNextAction } from "./trip-next-action";
import styles from "@/components/canvas/TripCanvas.module.css";

type TripListResponse = Readonly<{ currentTripId: string | null }>;
type TripReadResponse = Readonly<{ trip: TodayTrip; content: Readonly<{ days: readonly TodayDay[] }> }>;
type LoadState = "loading" | "ready" | "unavailable" | "unauthenticated";
type Copy = Readonly<{ eyebrow: string; title: string; loading: string; unavailable: string; signIn: string; signInBody: string; home: string; language: string; asOf: string; today: string; upcoming: string; noItems: string; complete: string; incomplete: string; openTrip: string }>;

const copy: Record<Locale, Copy> = {
  zh: { eyebrow: "今日", title: "已确认行程的下一步", loading: "正在读取已确认行程。", unavailable: "当前无法读取行程。", signIn: "登录", signInBody: "请登录后查看你的已确认行程。", home: "VisePanda 首页", language: "界面语言", asOf: "时间依据", today: "今天", upcoming: "即将开始", noItems: "已确认行程中没有条目。", complete: "该行程没有后续日期条目。", incomplete: "行程日期或时区不完整，无法可靠选择下一步。", openTrip: "打开行程" },
  en: { eyebrow: "Today", title: "The next step from your confirmed Trip", loading: "Reading your confirmed Trip.", unavailable: "Your Trip cannot be read right now.", signIn: "Sign in", signInBody: "Sign in to view your confirmed Trip.", home: "VisePanda home", language: "Interface language", asOf: "Clock", today: "Today", upcoming: "Upcoming", noItems: "There are no items in this confirmed Trip.", complete: "This Trip has no remaining dated items.", incomplete: "A Trip date or timezone is incomplete, so the next step cannot be selected reliably.", openTrip: "Open Trip" },
  es: { eyebrow: "Hoy", title: "El siguiente paso de tu viaje confirmado", loading: "Leyendo tu viaje confirmado.", unavailable: "Tu viaje no puede leerse ahora.", signIn: "Iniciar sesión", signInBody: "Inicia sesión para ver tu viaje confirmado.", home: "Inicio de VisePanda", language: "Idioma de la interfaz", asOf: "Reloj", today: "Hoy", upcoming: "Próximamente", noItems: "No hay elementos en este viaje confirmado.", complete: "Este viaje no tiene más elementos con fecha.", incomplete: "Falta una fecha o zona horaria del viaje; no se puede elegir el siguiente paso de forma fiable.", openTrip: "Abrir viaje" },
  ru: { eyebrow: "Сегодня", title: "Следующий шаг из подтверждённой поездки", loading: "Читаем подтверждённую поездку.", unavailable: "Сейчас поездку нельзя прочитать.", signIn: "Войти", signInBody: "Войдите, чтобы увидеть подтверждённую поездку.", home: "Главная VisePanda", language: "Язык интерфейса", asOf: "Время", today: "Сегодня", upcoming: "Скоро", noItems: "В этой подтверждённой поездке нет пунктов.", complete: "В этой поездке не осталось датированных пунктов.", incomplete: "Дата или часовой пояс поездки неполны, поэтому следующий шаг нельзя выбрать надёжно.", openTrip: "Открыть поездку" },
  ar: { eyebrow: "اليوم", title: "الخطوة التالية من رحلتك المؤكدة", loading: "جارٍ قراءة الرحلة المؤكدة.", unavailable: "لا يمكن قراءة رحلتك الآن.", signIn: "تسجيل الدخول", signInBody: "سجّل الدخول لعرض رحلتك المؤكدة.", home: "الصفحة الرئيسية لـ VisePanda", language: "لغة الواجهة", asOf: "الوقت", today: "اليوم", upcoming: "قريباً", noItems: "لا توجد عناصر في هذه الرحلة المؤكدة.", complete: "لا تحتوي هذه الرحلة على عناصر مؤرخة متبقية.", incomplete: "تاريخ الرحلة أو منطقتها الزمنية غير مكتمل، لذلك لا يمكن اختيار الخطوة التالية بشكل موثوق.", openTrip: "فتح الرحلة" },
};

export function TodayWorkspace() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [state, setState] = useState<LoadState>("loading");
  const [result, setResult] = useState<TripNextAction | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const text = copy[locale];
  useEffect(() => { const attributes = getLocaleAttributes(locale); document.documentElement.lang = attributes.lang; document.documentElement.dir = attributes.dir; }, [locale]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const list = await fetch("/api/trips", { cache: "no-store" });
        if (!active) return;
        if (list.status === 401) return setState("unauthenticated");
        if (!list.ok) return setState("unavailable");
        const { currentTripId } = await list.json() as TripListResponse;
        if (!currentTripId) { setResult({ state: "unavailable", reason: "no_items", tripId: "", tripVersion: -1 }); setNow(new Date()); return setState("ready"); }
        const tripId = currentTripId;
        const detail = await fetch(`/api/trips/${tripId}`, { cache: "no-store" });
        if (!active) return;
        if (detail.status === 401) return setState("unauthenticated");
        if (!detail.ok) return setState("unavailable");
        const data = await detail.json() as TripReadResponse;
        const clock = new Date();
        if (!active || data.trip.id !== tripId) return;
        setNow(clock); setResult(selectTripNextAction({ now: clock, trip: data.trip, days: data.content.days })); setState("ready");
      } catch { if (active) setState("unavailable"); }
    })();
    return () => { active = false; };
  }, []);
  const message = result?.reason === "no_items" ? text.noItems : result?.reason === "trip_complete" ? text.complete : text.incomplete;
  return <div className={styles.shell}><header className={styles.header}><Link className={styles.brand} href="/visepanda" aria-label={text.home}><VisePandaMark /></Link><Link className={styles.back} href="/visepanda">{text.home}</Link><label className={styles.language}>{text.language}<select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>{localeOptions.map((option) => <option key={option.value} value={option.value}>{option.flag} {option.label}</option>)}</select></label></header><main className={styles.main}><p className={styles.eyebrow}>{text.eyebrow}</p><h1 className={styles.title}>{text.title}</h1>{state === "loading" || state === "unavailable" ? <section className={styles.status} aria-live="polite"><p>{state === "loading" ? text.loading : text.unavailable}</p></section> : null}{state === "unauthenticated" ? <section className={styles.status}><p>{text.signInBody}</p><Link className={styles.action} href="/auth/sign-in?returnTo=/visepanda/today">{text.signIn}</Link></section> : null}{state === "ready" && result ? <section className={styles.proposal} aria-live="polite">{result.state === "available" ? <><p className={styles.eyebrow}>{result.reason === "today" ? text.today : text.upcoming}</p><h2>{result.itemTitle}</h2><p>{result.date}</p><Link className={styles.action} href={`/visepanda/trips/${result.tripId}?day=${encodeURIComponent(result.dayId)}`}>{text.openTrip}</Link></> : <p>{message}</p>}{now ? <p className={styles.meta}>{text.asOf} {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(now)}</p> : null}</section> : null}</main></div>;
}
