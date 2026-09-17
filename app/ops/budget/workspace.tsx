"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { renderOpsLedgerReport } from "@/apps/ops/ledger-report";
import { parseOpsLedgerSnapshot, type OpsLedgerSnapshot } from "@/lib/server/observability/ops-ledger";
import styles from "../review/workspace.module.css";

type State = "empty" | "busy" | "invalid" | "unavailable";
const copy = {
  zh: { heading: "运营预算快照", boundary: "仅限获准运营成员读取。金额是内部账本估计，未结费用保持待核；实际账单、模型延迟、工具调用和人工时间尚无可信来源。", scope: "预算 Scope ID", read: "读取快照", busy: "读取中…", empty: "输入预算 Scope ID。", invalid: "Scope ID 格式不正确。", unavailable: "当前无法读取；请核对登录、运营资格和 Scope。", login: "登录或切换账号", review: "内容审核" },
  en: { heading: "Ops budget snapshot", boundary: "Authorized Ops members only. Amounts are internal ledger estimates; unresolved costs remain pending. Actual billing, model latency, tool calls, and human time have no qualified source yet.", scope: "Budget Scope ID", read: "Read snapshot", busy: "Reading…", empty: "Enter a budget Scope ID.", invalid: "Invalid Scope ID.", unavailable: "Unable to read. Check sign-in, Ops access, and the Scope.", login: "Sign in or switch account", review: "Content review" },
} as const;

export function OpsBudgetWorkspace() {
  const [locale, setLocale] = useState<"zh" | "en">("zh");
  const [status, setStatus] = useState<State>("empty");
  const [report, setReport] = useState<OpsLedgerSnapshot | null>(null);
  const generation = useRef(0);
  const c = copy[locale];

  async function read(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const scopeId = String(new FormData(event.currentTarget).get("scopeId") ?? "").trim();
    const current = ++generation.current;
    setReport(null);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scopeId)) { setStatus("invalid"); return; }
    setStatus("busy");
    try {
      const response = await fetch(`/api/ops/budget?scopeId=${encodeURIComponent(scopeId)}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      const body = await response.json();
      if (current !== generation.current) return;
      if (!response.ok) { setStatus(response.status === 400 ? "invalid" : "unavailable"); return; }
      setReport(parseOpsLedgerSnapshot(body.data.snapshot));
      setStatus("empty");
    } catch { if (current === generation.current) setStatus("unavailable"); }
  }

  return <main className={styles.workspace}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>VisePanda · Ops</p><h1>{c.heading}</h1></div>
      <label>Language / 语言<select value={locale} onChange={event => setLocale(event.target.value as "zh" | "en")}><option value="zh">中文</option><option value="en">English</option></select></label>
    </header>
    <p className={styles.boundary}>{c.boundary}</p>
    <nav className={styles.actions}><Link href="/auth/sign-in?returnTo=/ops/budget">{c.login}</Link><Link href="/ops/review">{c.review}</Link></nav>
    <form className={styles.panel} onSubmit={read}>
      <label>{c.scope}<input name="scopeId" required pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" disabled={status === "busy"} /></label>
      <button type="submit" disabled={status === "busy"}>{c.read}</button>
    </form>
    <p role="status" aria-live="polite">{status === "busy" ? c.busy : status === "invalid" ? c.invalid : status === "unavailable" ? c.unavailable : report ? "" : c.empty}</p>
    {report ? <section className={styles.list} aria-label={c.heading}><pre className={styles.panel} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.7 }}>{renderOpsLedgerReport(report, locale)}</pre></section> : null}
  </main>;
}
