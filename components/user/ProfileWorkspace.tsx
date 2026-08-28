"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";
import styles from "@/components/canvas/TripCanvas.module.css";

type Profile = {
  displayName: string;
  travelPace: "relaxed" | "balanced" | "packed";
  locale: Locale;
  currency: "CNY" | "USD" | "EUR" | "RUB" | "SAR";
  distanceUnit: "kilometre" | "mile";
  temperatureUnit: "celsius" | "fahrenheit";
  defaultDepartureTime: string;
};
const blank: Profile = {
  displayName: "",
  travelPace: "balanced",
  locale: "zh",
  currency: "CNY",
  distanceUnit: "kilometre",
  temperatureUnit: "celsius",
  defaultDepartureTime: "09:00",
};
const copy: Record<
  Locale,
  {
    title: string;
    body: string;
    name: string;
    pace: string;
    currency: string;
    distanceUnit: string;
    temperatureUnit: string;
    departure: string;
    save: string;
    loading: string;
    unavailable: string;
    home: string;
    language: string;
  }
> = {
  zh: {
    title: "资料与偏好",
    body: "仅保存你明确填写的旅行偏好；它不会从 Memory 推断。",
    name: "显示名称",
    pace: "旅行节奏",
    currency: "货币",
    distanceUnit: "距离单位",
    temperatureUnit: "温度单位",
    departure: "默认出发时间",
    save: "保存偏好",
    loading: "正在读取资料…",
    unavailable: "资料服务暂不可用；未保存的编辑不会被视为已保存。",
    home: "VisePanda 首页",
    language: "界面语言",
  },
  en: {
    title: "Profile and preferences",
    body: "Only preferences you explicitly enter are saved; nothing is inferred from Memory.",
    name: "Display name",
    pace: "Travel pace",
    currency: "Currency",
    distanceUnit: "Distance unit",
    temperatureUnit: "Temperature unit",
    departure: "Default departure time",
    save: "Save preferences",
    loading: "Loading profile…",
    unavailable:
      "Profile is unavailable. Unsaved edits are not treated as saved.",
    home: "VisePanda home",
    language: "Interface language",
  },
  es: {
    title: "Perfil y preferencias",
    body: "Solo se guardan preferencias que escribes explícitamente; no se infiere nada de Memory.",
    name: "Nombre visible",
    pace: "Ritmo de viaje",
    currency: "Moneda",
    distanceUnit: "Unidad de distancia",
    temperatureUnit: "Unidad de temperatura",
    departure: "Hora de salida predeterminada",
    save: "Guardar preferencias",
    loading: "Cargando perfil…",
    unavailable:
      "El perfil no está disponible. Las ediciones no guardadas no se tratan como guardadas.",
    home: "Inicio de VisePanda",
    language: "Idioma de la interfaz",
  },
  ru: {
    title: "Профиль и предпочтения",
    body: "Сохраняются только явно указанные предпочтения; ничего не выводится из Memory.",
    name: "Отображаемое имя",
    pace: "Темп поездки",
    currency: "Валюта",
    distanceUnit: "Единица расстояния",
    temperatureUnit: "Единица температуры",
    departure: "Время отправления по умолчанию",
    save: "Сохранить",
    loading: "Загрузка профиля…",
    unavailable:
      "Профиль недоступен. Несохранённые изменения не считаются сохранёнными.",
    home: "Главная VisePanda",
    language: "Язык интерфейса",
  },
  ar: {
    title: "الملف الشخصي والتفضيلات",
    body: "تُحفظ التفضيلات التي تدخلها صراحةً فقط؛ لا يُستنتج شيء من الذاكرة.",
    name: "اسم العرض",
    pace: "وتيرة الرحلة",
    currency: "العملة",
    distanceUnit: "وحدة المسافة",
    temperatureUnit: "وحدة الحرارة",
    departure: "وقت المغادرة الافتراضي",
    save: "حفظ التفضيلات",
    loading: "جارٍ تحميل الملف…",
    unavailable:
      "الملف غير متاح. لا تُعامل التعديلات غير المحفوظة على أنها محفوظة.",
    home: "الصفحة الرئيسية لـ VisePanda",
    language: "لغة الواجهة",
  },
};

export function ProfileWorkspace() {
  const [locale, setLocale] = useState<Locale>("zh"),
    [profile, setProfile] = useState<Profile>(blank),
    [ready, setReady] = useState(false),
    [error, setError] = useState(false),
    [saving, setSaving] = useState(false),
    words = copy[locale];
  const load = async () => {
    const r = await fetch("/api/profile");
    if (!r.ok) throw Error();
    const v = await r.json();
    setProfile(v ?? blank);
    if (v) setLocale(v.locale);
    setReady(true);
  };
  useEffect(() => {
    const attributes = getLocaleAttributes(locale);
    document.documentElement.lang = attributes.lang;
    document.documentElement.dir = attributes.dir;
  }, [locale]);
  useEffect(() => {
    void load().catch(() => setError(true));
  }, []);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(false);
    try {
      const r = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...profile, locale }),
      });
      if (!r.ok) throw Error();
      await load();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setProfile((p) => ({ ...p, [key]: value }));
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link
          className={styles.brand}
          href="/visepanda"
          aria-label={words.home}
        >
          <VisePandaMark />
        </Link>
        <select
          aria-label={words.language}
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
        >
          {localeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.flag} {o.label}
            </option>
          ))}
        </select>
      </header>
      <main className={styles.main}>
        <p className={styles.eyebrow}>Profile</p>
        <h1 className={styles.title}>{words.title}</h1>
        <p className={styles.lede}>{words.body}</p>
        {error ? (
          <p className={styles.notice} aria-live="polite">
            {words.unavailable}
          </p>
        ) : null}
        {!ready && !error ? (
          <p className={styles.notice}>{words.loading}</p>
        ) : null}
        <form className={styles.panel} onSubmit={save}>
          <label>
            {words.name}
            <input
              value={profile.displayName}
              maxLength={80}
              onChange={(e) => set("displayName", e.target.value)}
            />
          </label>
          <label>
            {words.pace}
            <select
              value={profile.travelPace}
              onChange={(e) =>
                set("travelPace", e.target.value as Profile["travelPace"])
              }
            >
              <option value="relaxed">relaxed</option>
              <option value="balanced">balanced</option>
              <option value="packed">packed</option>
            </select>
          </label>
          <label>
            {words.currency}
            <select
              value={profile.currency}
              onChange={(e) =>
                set("currency", e.target.value as Profile["currency"])
              }
            >
              {["CNY", "USD", "EUR", "RUB", "SAR"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            {words.distanceUnit}
            <select
              value={profile.distanceUnit}
              onChange={(e) =>
                set("distanceUnit", e.target.value as Profile["distanceUnit"])
              }
            >
              <option value="kilometre">kilometre</option>
              <option value="mile">mile</option>
            </select>
          </label>
          <label>
            {words.temperatureUnit}
            <select
              value={profile.temperatureUnit}
              onChange={(e) =>
                set(
                  "temperatureUnit",
                  e.target.value as Profile["temperatureUnit"],
                )
              }
            >
              <option value="celsius">celsius</option>
              <option value="fahrenheit">fahrenheit</option>
            </select>
          </label>
          <label>
            {words.departure}
            <input
              type="time"
              value={profile.defaultDepartureTime}
              onChange={(e) => set("defaultDepartureTime", e.target.value)}
            />
          </label>
          <button className={styles.button} disabled={saving || !ready}>
            {words.save}
          </button>
        </form>
      </main>
    </div>
  );
}
