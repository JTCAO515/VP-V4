"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { VisePandaMark } from "@/components/brand/VisePandaMark";
import { getLocaleAttributes, getLocaleSelectionOptions, type Locale } from "@/lib/i18n";
import memoryStyles from "@/components/copilot/CopilotMemoryWorkspace.module.css";
import { createReadbackIsCurrent, parseCreateReceipt, takeCreateToast } from "@/components/copilot/memory-create-toast";
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
  revision: number | null;
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
type PendingCreate = {
  ownerId: string;
  memoryId: string;
  receiptId: string;
  consentId: string | null;
  constraintKind: ConstraintKind;
  summary: string;
};
type SavedToast = Readonly<{
  ownerId: string;
  memoryId: string;
  sourceReceiptId: string;
  revision: number;
  undoOperationId: string | null;
  outcomeUnknown: boolean;
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
  saved: string;
  undo: string;
  undone: string;
  undoConflict: string;
  undoUnknown: string;
  createChanged: string;
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
    saved: "已加入记忆",
    undo: "撤销",
    undone: "已撤销",
    undoConflict: "这条记忆已变化，撤销未执行；请核对最新状态。",
    undoUnknown: "撤销结果尚未确认，可重试同一次撤销。",
    createChanged: "这条记忆的状态已变化，请核对列表中的最新状态。",
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
    saved: "Saved to memory",
    undo: "Undo",
    undone: "Undone",
    undoConflict: "This memory changed. Undo was not applied; check its current state.",
    undoUnknown: "Undo could not be confirmed. Retry the same undo.",
    createChanged: "This memory changed. Check its current state in the list.",
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
    saved: "Guardado en memoria",
    undo: "Deshacer",
    undone: "Deshecho",
    undoConflict: "Esta memoria cambió. Comprueba su estado actual.",
    undoUnknown: "No se confirmó la reversión. Reintenta la misma acción.",
    createChanged: "Esta memoria cambió. Comprueba su estado actual en la lista.",
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
    saved: "Добавлено в память",
    undo: "Отменить",
    undone: "Отменено",
    undoConflict: "Эта запись изменилась. Проверьте её текущее состояние.",
    undoUnknown: "Отмена не подтверждена. Повторите ту же операцию.",
    createChanged: "Эта запись изменилась. Проверьте её текущее состояние в списке.",
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
    saved: "أُضيف إلى الذاكرة",
    undo: "تراجع",
    undone: "تم التراجع",
    undoConflict: "تغيّرت هذه الذاكرة. تحقّق من حالتها الحالية.",
    undoUnknown: "لم يتأكد التراجع. أعد محاولة التراجع نفسه.",
    createChanged: "تغيّرت حالة هذه الذاكرة. تحقّق من أحدث حالة في القائمة.",
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
  const [toast, setToast] = useState<SavedToast | null>(null);
  const [notice, setNotice] = useState<"undone" | "undoConflict" | "undoUnknown" | "createChanged" | null>(null);
  const [undoFocused, setUndoFocused] = useState(false);
  const [toastHovered, setToastHovered] = useState(false);
  const ownerScope = useRef<string | null>(null);
  const loadGeneration = useRef(0);
  const pendingCreate = useRef<PendingCreate | null>(null);
  const shownCreates = useRef(new Set<string>());
  const words = copy[locale];

  const load = useCallback(async (): Promise<Readonly<{ ownerId: string; profiles: readonly MemoryProfile[] }> | null> => {
    const generation = ++loadGeneration.current;
    setError(false);
    const response = await fetch("/api/memory", {
      headers: { Accept: "application/json" },
    });
    if (response.status === 401 || response.status === 403) {
      setToast(null); setNotice(null); setProfiles(null);
      pendingCreate.current = null; ownerScope.current = null; setSummary("");
      shownCreates.current.clear();
    }
    if (!response.ok) return messageFor(response);
    const data: unknown = await response.json();
    const ownerId = response.headers.get("X-VP-Memory-Owner");
    if (!Array.isArray(data) || !ownerId) throw new Error("memory_response_invalid");
    if (generation !== loadGeneration.current) return null;
    if (ownerScope.current !== null && ownerScope.current !== ownerId) {
      setToast(null);
      setNotice(null);
      pendingCreate.current = null;
      shownCreates.current.clear();
      setSummary("");
    }
    ownerScope.current = ownerId;
    const profiles = data as readonly MemoryProfile[];
    setProfiles(profiles);
    return { ownerId, profiles };
  }, []);
  useEffect(() => {
    const attributes = getLocaleAttributes(locale);
    document.documentElement.lang = attributes.lang;
    document.documentElement.dir = attributes.dir;
  }, [locale]);
  useEffect(() => {
    const refresh = () => {
      void load().catch(() => {
        setToast(null); setNotice(null); setProfiles(null);
        pendingCreate.current = null; ownerScope.current = null; setSummary(""); setError(true);
        shownCreates.current.clear();
      });
    };
    refresh();
    window.addEventListener("focus", refresh);
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);
  useEffect(() => {
    if (!toast || toast.outcomeUnknown || pending || undoFocused || toastHovered) return;
    const timer = window.setTimeout(() => {
      setToast((current) => current?.memoryId === toast.memoryId && current.revision === toast.revision ? null : current);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [toast, pending, undoFocused, toastHovered]);
  useEffect(() => { if (!toast) { setToastHovered(false); setUndoFocused(false); } }, [toast]);

  const mutate = async (url: string, body: object) => {
    setPending(true);
    setError(false);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 401 || response.status === 403) {
        setToast(null); setProfiles(null); pendingCreate.current = null; ownerScope.current = null; setSummary("");
        shownCreates.current.clear();
      }
      if (!response.ok) await messageFor(response);
      setToast(null);
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
    const ownerId = ownerScope.current;
    if (!trimmed || pending || !ownerId) return;
    const existing = pendingCreate.current;
    const command: PendingCreate = existing && existing.ownerId === ownerId &&
      existing.summary === trimmed && existing.constraintKind === constraintKind
      ? existing : { ownerId, memoryId: crypto.randomUUID(), receiptId: crypto.randomUUID(),
          consentId: null, constraintKind, summary: trimmed };
    pendingCreate.current = command;
    setPending(true);
    setError(false);
    setNotice(null);
    try {
      if (!command.consentId) {
        const consent = await fetch("/api/memory/consent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", expectedOwnerId: ownerId }),
        });
        if (consent.status === 401 || consent.status === 403) {
          setToast(null); setProfiles(null); pendingCreate.current = null; ownerScope.current = null; setSummary("");
          shownCreates.current.clear();
        }
        if (!consent.ok) await messageFor(consent);
        const consentData = await consent.json() as Readonly<{ consentId?: unknown; status?: unknown }>;
        if (typeof consentData.consentId !== "string" || consentData.status !== "granted")
          throw new Error("memory_consent_response_invalid");
        command.consentId = consentData.consentId;
      }
      const response = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memoryId: command.memoryId,
          receiptId: command.receiptId,
          consentId: command.consentId,
          constraintKind: command.constraintKind,
          summary: command.summary,
          expectedOwnerId: ownerId,
        }),
      });
      if (response.status === 401 || response.status === 403) {
        setToast(null); setProfiles(null); pendingCreate.current = null; ownerScope.current = null; setSummary("");
        shownCreates.current.clear();
      }
      if (!response.ok) await messageFor(response);
      const receipt = parseCreateReceipt(await response.json(), {
        memoryId: command.memoryId, receiptId: command.receiptId, ownerId,
      });
      const readback = await load();
      if (readback?.ownerId !== ownerId || ownerScope.current !== ownerId) return;
      if (pendingCreate.current === command) pendingCreate.current = null;
      setSummary((current) => current.trim() === command.summary ? "" : current);
      if (!receipt.undoAvailable) return;
      const current = readback.profiles.find(memory => memory.id === command.memoryId);
      if (!createReadbackIsCurrent(receipt, current)) {
        setNotice("createChanged");
      } else if (takeCreateToast(receipt, readback.ownerId, shownCreates.current)) {
        setToast({ ownerId, memoryId: command.memoryId,
          sourceReceiptId: command.receiptId, revision: 1, undoOperationId: null,
          outcomeUnknown: false });
      }
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  const undoCreate = async () => {
    if (!toast || pending) return;
    if (ownerScope.current !== toast.ownerId) { setToast(null); return; }
    const operationId = toast.undoOperationId ?? crypto.randomUUID();
    setToast({ ...toast, undoOperationId: operationId, outcomeUnknown: false });
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/memory/${toast.memoryId}/undo`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceReceiptId: toast.sourceReceiptId,
          expectedRevision: toast.revision, operationId }),
      });
      if (response.status === 409) {
        setToast(null);
        setNotice("undoConflict");
        await load();
        return;
      }
      if (response.status === 401 || response.status === 403) {
        setToast(null); setNotice(null); setProfiles(null); setSummary("");
        pendingCreate.current = null; ownerScope.current = null;
        shownCreates.current.clear();
        throw new Error("memory_owner_changed");
      }
      if (!response.ok) await messageFor(response);
      const result = await response.json() as Readonly<{ memoryId?: unknown; state?: unknown; revision?: unknown; ownerId?: unknown }>;
      if (result.memoryId !== toast.memoryId || result.state !== "deleted" ||
          result.revision !== toast.revision + 1 || result.ownerId !== toast.ownerId)
        throw new Error("memory_undo_receipt_invalid");
      const readback = await load();
      setToast(null);
      if (readback?.ownerId === toast.ownerId && readback.profiles.some(memory =>
        memory.id === toast.memoryId && memory.state === "deleted" && memory.revision === toast.revision + 1))
        setNotice("undone");
    } catch {
      if (ownerScope.current !== toast.ownerId) setToast(null);
      else {
        setToast({ ...toast, undoOperationId: operationId, outcomeUnknown: true });
        setNotice("undoUnknown");
      }
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
          {getLocaleSelectionOptions(locale).map((option) => (
            <option key={option.value} value={option.value}>
              {option.flag} {option.label}
            </option>
          ))}
        </select>
      </header>
      {toast && ownerScope.current === toast.ownerId ? (
        <div className={memoryStyles.savedToast} role="status" aria-live="polite"
          onPointerEnter={() => setToastHovered(true)} onPointerLeave={() => setToastHovered(false)}>
          <span>{toast.outcomeUnknown ? words.undoUnknown : words.saved}</span>
          <button type="button" className={memoryStyles.toastUndo} disabled={pending}
            onFocus={() => setUndoFocused(true)} onBlur={() => setUndoFocused(false)}
            onClick={() => void undoCreate()}>{words.undo}</button>
        </div>
      ) : null}
      {notice && !toast ? (
        <div className={memoryStyles.savedToast} role="status" aria-live="polite">
          {words[notice]}
        </div>
      ) : null}
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
                onChange={(event) => { pendingCreate.current = null; setSummary(event.target.value); }}
              />
            </label>
            <label>
              {words.summary}
              <select
                value={constraintKind}
                onChange={(event) => {
                  pendingCreate.current = null;
                  setConstraintKind(event.target.value as ConstraintKind);
                }}
              >
                <option value="preference">{words.preference}</option>
                <option value="hard_constraint">{words.hard}</option>
              </select>
            </label>
            <button className={styles.button} disabled={pending || profiles === null || !ownerScope.current} type="submit">
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
