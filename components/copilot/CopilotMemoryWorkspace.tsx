"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { getLocaleAttributes, localeOptions, type Locale } from "@/lib/i18n";
import memoryStyles from "@/components/copilot/CopilotMemoryWorkspace.module.css";
import styles from "@/components/canvas/TripCanvas.module.css";

type MemoryState =
  | "explicit"
  | "confirmed"
  | "inferred"
  | "rejected"
  | "paused"
  | "deleted";
type ConstraintKind = "preference" | "hard_constraint";
type MemoryProfile = Readonly<{
  id: string;
  state: MemoryState;
  constraintKind: ConstraintKind;
  summary: string | null;
  sourceReceiptId: string;
  consentId: string;
  consentStatus: "granted" | "revoked";
  createdAt: string;
  updatedAt: string;
  impacts: readonly Readonly<{
    consumerKind: "turn" | "proposal";
    consumerId: string;
    sourceReceiptId: string;
    constraintKind: ConstraintKind;
    createdAt: string;
  }>[];
}>;
type Copy = Readonly<{
  eyebrow: string;
  title: string;
  body: string;
  loading: string;
  empty: string;
  unavailable: string;
  source: string;
  updated: string;
  impact: string;
  noImpact: string;
  consent: string;
  granted: string;
  revoked: string;
  grant: string;
  revoke: string;
  confirm: string;
  reject: string;
  pause: string;
  resume: string;
  forget: string;
  add: string;
  summary: string;
  preference: string;
  hard: string;
  save: string;
  back: string;
  home: string;
  language: string;
}>;

const copy: Record<Locale, Copy> = {
  zh: {
    eyebrow: "Copilot",
    title: "记忆治理",
    body: "查看由你控制的偏好、来源和已记录影响。所有更改通过受限的持久化记录完成。",
    loading: "正在读取记忆…",
    empty: "暂无记忆。你可以明确添加一条偏好。",
    unavailable: "记忆服务当前不可用。不会显示或伪造本地数据。",
    source: "来源回执",
    updated: "更新时间",
    impact: "已记录影响",
    noImpact: "尚无已记录影响。",
    consent: "检索同意",
    granted: "已授予",
    revoked: "已撤回",
    grant: "授予",
    revoke: "撤回",
    confirm: "确认",
    reject: "拒绝",
    pause: "暂停",
    resume: "恢复",
    forget: "遗忘",
    add: "添加明确记忆",
    summary: "偏好或限制",
    preference: "偏好",
    hard: "硬限制",
    save: "保存记忆",
    back: "返回 VisePanda",
    home: "VisePanda 首页",
    language: "界面语言",
  },
  en: {
    eyebrow: "Copilot",
    title: "Memory governance",
    body: "Review preferences, sources, and recorded impacts under your control. Every change uses a constrained durable record.",
    loading: "Loading memory…",
    empty: "No memory yet. Add an explicit preference when you are ready.",
    unavailable:
      "Memory is unavailable right now. No local data is shown or invented.",
    source: "Source receipt",
    updated: "Updated",
    impact: "Recorded impact",
    noImpact: "No recorded impact yet.",
    consent: "Retrieval consent",
    granted: "Granted",
    revoked: "Revoked",
    grant: "Grant",
    revoke: "Revoke",
    confirm: "Confirm",
    reject: "Reject",
    pause: "Pause",
    resume: "Resume",
    forget: "Forget",
    add: "Add explicit memory",
    summary: "Preference or constraint",
    preference: "Preference",
    hard: "Hard constraint",
    save: "Save memory",
    back: "Back to VisePanda",
    home: "VisePanda home",
    language: "Interface language",
  },
  es: {
    eyebrow: "Copilot",
    title: "Gobernanza de memoria",
    body: "Revisa preferencias, fuentes e impactos registrados bajo tu control. Cada cambio usa un registro persistente restringido.",
    loading: "Cargando memoria…",
    empty: "Aún no hay memoria. Puedes añadir una preferencia explícita.",
    unavailable:
      "La memoria no está disponible ahora. No se muestran ni inventan datos locales.",
    source: "Recibo de origen",
    updated: "Actualizado",
    impact: "Impacto registrado",
    noImpact: "Aún no hay impacto registrado.",
    consent: "Consentimiento de recuperación",
    granted: "Concedido",
    revoked: "Revocado",
    grant: "Conceder",
    revoke: "Revocar",
    confirm: "Confirmar",
    reject: "Rechazar",
    pause: "Pausar",
    resume: "Reanudar",
    forget: "Olvidar",
    add: "Añadir memoria explícita",
    summary: "Preferencia o restricción",
    preference: "Preferencia",
    hard: "Restricción estricta",
    save: "Guardar memoria",
    back: "Volver a VisePanda",
    home: "Inicio de VisePanda",
    language: "Idioma de la interfaz",
  },
  ru: {
    eyebrow: "Copilot",
    title: "Управление памятью",
    body: "Просматривайте предпочтения, источники и зафиксированное влияние под вашим контролем. Каждое изменение использует ограниченную постоянную запись.",
    loading: "Загрузка памяти…",
    empty: "Памяти пока нет. Добавьте явное предпочтение, когда будете готовы.",
    unavailable:
      "Память сейчас недоступна. Локальные данные не показываются и не создаются.",
    source: "Исходная квитанция",
    updated: "Обновлено",
    impact: "Зафиксированное влияние",
    noImpact: "Зафиксированного влияния пока нет.",
    consent: "Согласие на извлечение",
    granted: "Дано",
    revoked: "Отозвано",
    grant: "Разрешить",
    revoke: "Отозвать",
    confirm: "Подтвердить",
    reject: "Отклонить",
    pause: "Приостановить",
    resume: "Возобновить",
    forget: "Забыть",
    add: "Добавить явную память",
    summary: "Предпочтение или ограничение",
    preference: "Предпочтение",
    hard: "Строгое ограничение",
    save: "Сохранить память",
    back: "Назад к VisePanda",
    home: "Главная VisePanda",
    language: "Язык интерфейса",
  },
  ar: {
    eyebrow: "Copilot",
    title: "إدارة الذاكرة",
    body: "راجع التفضيلات والمصادر والآثار المسجلة التي تتحكم بها. يستخدم كل تغيير سجلاً دائماً مقيّداً.",
    loading: "جارٍ تحميل الذاكرة…",
    empty: "لا توجد ذاكرة بعد. أضف تفضيلاً صريحاً عندما تكون جاهزاً.",
    unavailable: "الذاكرة غير متاحة الآن. لا يتم عرض بيانات محلية أو اختراعها.",
    source: "إيصال المصدر",
    updated: "آخر تحديث",
    impact: "الأثر المسجل",
    noImpact: "لا يوجد أثر مسجل بعد.",
    consent: "موافقة الاسترجاع",
    granted: "ممنوحة",
    revoked: "مسحوبة",
    grant: "منح",
    revoke: "سحب",
    confirm: "تأكيد",
    reject: "رفض",
    pause: "إيقاف مؤقت",
    resume: "استئناف",
    forget: "نسيان",
    add: "إضافة ذاكرة صريحة",
    summary: "تفضيل أو قيد",
    preference: "تفضيل",
    hard: "قيد صارم",
    save: "حفظ الذاكرة",
    back: "العودة إلى VisePanda",
    home: "الصفحة الرئيسية لـ VisePanda",
    language: "لغة الواجهة",
  },
};

function messageFor(response: Response): Promise<never> {
  return response
    .json()
    .catch(() => null)
    .then(() => {
      throw new Error("memory_request_failed");
    });
}

export function CopilotMemoryWorkspace() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [profiles, setProfiles] = useState<readonly MemoryProfile[] | null>(
    null,
  );
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const [summary, setSummary] = useState("");
  const [constraintKind, setConstraintKind] =
    useState<ConstraintKind>("preference");
  const words = copy[locale];

  const load = async () => {
    setError(false);
    const response = await fetch("/api/memory", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return messageFor(response);
    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new Error("memory_response_invalid");
    setProfiles(data as readonly MemoryProfile[]);
  };
  useEffect(() => {
    const attributes = getLocaleAttributes(locale);
    document.documentElement.lang = attributes.lang;
    document.documentElement.dir = attributes.dir;
  }, [locale]);
  useEffect(() => {
    void load().catch(() => setError(true));
  }, []);

  const mutate = async (url: string, body: object) => {
    setPending(true);
    setError(false);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) await messageFor(response);
      await load();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };
  const addMemory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = summary.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(false);
    try {
      const consent = await fetch("/api/memory/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      if (!consent.ok) await messageFor(consent);
      const consentData = await consent.json() as Readonly<{ consentId?: unknown; status?: unknown }>;
      if (typeof consentData.consentId !== "string" || consentData.status !== "granted") throw new Error("Memory consent creation returned an invalid response");
      const consentId = consentData.consentId;
      const response = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memoryId: crypto.randomUUID(),
          receiptId: crypto.randomUUID(),
          consentId,
          constraintKind,
          summary: trimmed,
        }),
      });
      if (!response.ok) await messageFor(response);
      setSummary("");
      await load();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

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
        <Link className={styles.back} href="/visepanda">
          {words.back}
        </Link>
        <select
          aria-label={words.language}
          value={locale}
          onChange={(event) => setLocale(event.target.value as Locale)}
        >
          {localeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.flag} {option.label}
            </option>
          ))}
        </select>
      </header>
      <main className={styles.main}>
        <p className={styles.eyebrow}>{words.eyebrow}</p>
        <h1 className={styles.title}>{words.title}</h1>
        <p className={styles.lede}>{words.body}</p>
        {error ? (
          <section className={styles.notice} aria-live="polite">
            {words.unavailable}
          </section>
        ) : null}
        <section className={styles.panel}>
          <h2>{words.add}</h2>
          <form className={memoryStyles.memoryForm} onSubmit={addMemory}>
            <label>
              {words.summary}
              <textarea
                value={summary}
                maxLength={500}
                required
                onChange={(event) => setSummary(event.target.value)}
              />
            </label>
            <label>
              {words.summary}
              <select
                value={constraintKind}
                onChange={(event) =>
                  setConstraintKind(event.target.value as ConstraintKind)
                }
              >
                <option value="preference">{words.preference}</option>
                <option value="hard_constraint">{words.hard}</option>
              </select>
            </label>
            <button className={styles.button} disabled={pending} type="submit">
              {words.save}
            </button>
          </form>
        </section>
        {profiles === null && !error ? (
          <p className={styles.notice} aria-live="polite">
            {words.loading}
          </p>
        ) : null}
        {profiles?.length === 0 ? (
          <p className={styles.notice}>{words.empty}</p>
        ) : null}
        <section className={memoryStyles.memoryList}>
          {profiles?.map((memory) => (
            <article className={styles.panel} key={memory.id}>
              <div className={memoryStyles.memoryHeading}>
                <div>
                  <strong>{memory.summary ?? words.forget}</strong>
                  <p className={styles.meta}>
                    {memory.constraintKind === "hard_constraint"
                      ? words.hard
                      : words.preference}{" "}
                    · {memory.state}
                  </p>
                </div>
                <span className={styles.meta}>
                  {words.updated}:{" "}
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                  }).format(new Date(memory.updatedAt))}
                </span>
              </div>
              <p className={styles.meta}>
                {words.source}: {memory.sourceReceiptId}
              </p>
              <p className={styles.meta}>
                {words.consent}:{" "}
                {memory.consentStatus === "granted"
                  ? words.granted
                  : words.revoked}{" "}
                <button
                  className={memoryStyles.inlineButton}
                  disabled={pending}
                  type="button"
                  onClick={() =>
                    void mutate("/api/memory/consent", {
                      consentId: memory.consentId,
                      action:
                        memory.consentStatus === "granted" ? "revoke" : "grant",
                    })
                  }
                >
                  {memory.consentStatus === "granted"
                    ? words.revoke
                    : words.grant}
                </button>
              </p>
              <div>
                <strong>{words.impact}</strong>
                {memory.impacts.length === 0 ? (
                  <p className={styles.meta}>{words.noImpact}</p>
                ) : (
                  <ul className={memoryStyles.memoryImpacts}>
                    {memory.impacts.map((impact) => (
                      <li key={`${impact.consumerKind}-${impact.consumerId}`}>
                        {impact.consumerKind} · {impact.consumerId} ·{" "}
                        {impact.sourceReceiptId}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className={styles.proposalActions}>
                {memory.state === "inferred" ? (
                  <button
                    className={styles.secondary}
                    disabled={pending}
                    type="button"
                    onClick={() =>
                      void mutate(`/api/memory/${memory.id}`, {
                        state: "confirmed",
                      })
                    }
                  >
                    {words.confirm}
                  </button>
                ) : null}
                {memory.state === "paused" ? (
                  <button
                    className={styles.secondary}
                    disabled={pending}
                    type="button"
                    onClick={() =>
                      void mutate(`/api/memory/${memory.id}`, {
                        state: "confirmed",
                      })
                    }
                  >
                    {words.resume}
                  </button>
                ) : null}
                {memory.state === "explicit" ||
                memory.state === "confirmed" ||
                memory.state === "inferred" ? (
                  <button
                    className={styles.secondary}
                    disabled={pending}
                    type="button"
                    onClick={() =>
                      void mutate(`/api/memory/${memory.id}`, {
                        state: "paused",
                      })
                    }
                  >
                    {words.pause}
                  </button>
                ) : null}
                {!["rejected", "deleted"].includes(memory.state) ? (
                  <button
                    className={styles.secondary}
                    disabled={pending}
                    type="button"
                    onClick={() =>
                      void mutate(`/api/memory/${memory.id}`, {
                        state: "rejected",
                      })
                    }
                  >
                    {words.reject}
                  </button>
                ) : null}
                {!["rejected", "deleted"].includes(memory.state) ? (
                  <button
                    className={styles.secondary}
                    disabled={pending}
                    type="button"
                    onClick={() =>
                      void mutate(`/api/memory/${memory.id}`, {
                        state: "deleted",
                      })
                    }
                  >
                    {words.forget}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
