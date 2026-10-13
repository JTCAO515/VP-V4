"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPasswordAuthClient } from "@/lib/server/identity/browser-auth-client";
import { ApiError, qaApi, type Message, type Policy, type Session } from "./api";
import styles from "./QaAgentWorkspace.module.css";

const copy = {
  zh: { sessions: "会话", new: "新会话", empty: "选择或新建会话", input: "输入消息", send: "发送", loading: "正在读取…", replying: "正在回复…", error: "暂时无法完成请求，请检查原请求状态。", recover: "检查原请求", retry: "重发原请求", forbidden: "无法读取原请求。重发仍使用原请求编号，由服务器核验权限及幂等性。", refresh: "重新读取", signIn: "登录", consent: "同意以上说明", unknown: "发送结果尚未确认。原请求编号已保留。", you: "你", assistant: "助手", blocked: "请求被阻止", failure: "请求未完成", partial: "部分答复", clarification: "需要补充信息" },
  en: { sessions: "Sessions", new: "New session", empty: "Select or create a session", input: "Message", send: "Send", loading: "Loading…", replying: "Replying…", error: "The request could not be completed. Check the original request status.", recover: "Check original request", retry: "Resend original request", forbidden: "The original request is unavailable. Resending keeps its original ID; the server verifies permission and idempotency.", refresh: "Reload", signIn: "Sign in", consent: "Agree to the notice above", unknown: "Delivery is unconfirmed. The original request ID is retained.", you: "You", assistant: "Assistant", blocked: "Request blocked", failure: "Request incomplete", partial: "Partial answer", clarification: "More information needed" },
};
type Pending = { requestId: string; text: string; retryAllowed: boolean };

export function QaAgentWorkspace() {
  const params = useSearchParams();
  const locale = params.get("locale") === "en" ? "en" : "zh";
  const [actor, setActor] = useState<string | null>(null);
  useEffect(() => {
    const client = createPasswordAuthClient();
    if (!client) { setActor("unavailable"); return; }
    const { data } = client.auth.onAuthStateChange((_event, session) => setActor(session?.user.id ?? "signed-out"));
    return () => data.subscription.unsubscribe();
  }, []);
  if (actor === null) return <p role="status">{copy[locale].loading}</p>;
  if (actor === "signed-out") return <Link href="/auth/sign-in?returnTo=/qa">{copy[locale].signIn}</Link>;
  if (actor === "unavailable") return <p role="alert">{copy[locale].error}</p>;
  return <Workspace key={actor} locale={locale} initialSession={params.get("session")} />;
}

function Workspace({ locale, initialSession }: { locale: "zh" | "en"; initialSession: string | null }) {
  const c = copy[locale];
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingBySession = useRef(new Map<string, Pending>());
  const current = useRef<{ epoch: number; controller: AbortController; busy: boolean }>({ epoch: 0, controller: new AbortController(), busy: false });
  const scroll = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  function scope() {
    current.current.controller.abort();
    current.current = { epoch: current.current.epoch + 1, controller: new AbortController(), busy: false };
    setBusy(false);
    return current.current;
  }
  function fail(reason: unknown, token: typeof current.current) {
    if (current.current !== token || token.controller.signal.aborted) return;
    if (reason instanceof ApiError && reason.status === 401) {
      pendingBySession.current.clear(); setMessages([]); setSessions([]); setPolicy(null); setPending(null); setUnauthenticated(true);
    } else {
      if (reason instanceof ApiError && reason.code === "DATA_POLICY_BLOCKED") { setPolicy(null); setMessages([]); }
      setError(true);
    }
  }
  useEffect(() => {
    const token = scope();
    void Promise.all([qaApi.sessions(token.controller.signal), qaApi.policy(token.controller.signal)])
      .then(([list, notice]) => { if (current.current === token && !token.controller.signal.aborted) { setSessions(list.sessions); setPolicy(notice);
        if (initialSession && list.sessions.some(session => session.id === initialSession)) void select(initialSession); } })
      .catch(reason => fail(reason, token)).finally(() => { if (!token.controller.signal.aborted) setLoading(false); });
    return () => { current.current.controller.abort(); };
  }, []);
  useEffect(() => { scroll.current?.scrollIntoView({ block: "end" }); }, [messages, pending]);
  async function select(id: string) {
    const token = scope();
    const url = new URL(window.location.href); url.searchParams.set("session", id); window.history.replaceState(null, "", url);
    setSelected(id); setHistoryReady(false); setMessages([]); if (selected !== id) setText(""); setError(false); setForbidden(false); setLoading(true); setPending(pendingBySession.current.get(id) ?? null);
    try {
      const history = await qaApi.history(id, token.controller.signal);
      if (current.current !== token) return;
      setMessages(history.messages); setHistoryReady(true);
      const original = pendingBySession.current.get(id);
      if (original && history.messages.some(message => message.requestId === original.requestId)) { pendingBySession.current.delete(id); setPending(null); }
    } catch (reason) { fail(reason, token); }
    finally { if (current.current === token) setLoading(false); }
  }
  async function create() {
    if (current.current.busy) return;
    const token = scope(); token.busy = true; setBusy(true); setError(false);
    try {
      const result = await qaApi.create(token.controller.signal);
      if (current.current !== token) return;
      setSessions(list => [result.session, ...list.filter(item => item.id !== result.session.id)]);
      await select(result.session.id);
    } catch (reason) { fail(reason, token); }
    finally { if (current.current === token) { token.busy = false; setBusy(false); } }
  }
  async function submit(recover = false) {
    if (!selected || loading || (!recover && !historyReady) || current.current.busy || messages.some(message => message.status === "pending") || !policy?.consented) return;
    const id = selected;
    const original = pendingBySession.current.get(id) ?? { requestId: crypto.randomUUID(), text, retryAllowed: false };
    if (!original.text.trim()) return;
    const token = current.current; token.busy = true; setBusy(true); setError(false);
    pendingBySession.current.set(id, original); setPending(original);
    try {
      const result = recover
        ? await qaApi.recover(id, original.requestId, token.controller.signal)
        : await qaApi.send(id, { requestId: original.requestId, text: original.text }, token.controller.signal);
      if (current.current !== token) return;
      setMessages(list => [...list.filter(message => message.requestId !== result.message.requestId), result.message]);
      pendingBySession.current.delete(id); setPending(null); setText("");
    } catch (reason) {
      if (current.current !== token) return;
      if (recover && reason instanceof ApiError && reason.status === 403 && reason.code === "FORBIDDEN") {
        setForbidden(true);
        const retry = { ...original, retryAllowed: true }; pendingBySession.current.set(id, retry); setPending(retry);
      } else {
        if (!recover && reason instanceof ApiError && reason.ack === "not_submitted") { pendingBySession.current.delete(id); setPending(null); }
        fail(reason, token);
      }
    } finally { if (current.current === token) { token.busy = false; setBusy(false); } }
  }
  // Restored pending jobs are read only; polling never re-admits work.
  useEffect(() => {
    if (!selected || !messages.some(message => message.status === "pending")) return;
    const token = current.current;
    const timer = window.setTimeout(() => {
      void qaApi.history(selected, token.controller.signal).then(history => { if (current.current === token) setMessages(history.messages); }).catch(reason => fail(reason, token));
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [selected, messages]);
  async function consent() {
    if (!policy || current.current.busy) return;
    const token = current.current; token.busy = true; setBusy(true);
    try { const result = await qaApi.consent(policy, token.controller.signal); if (current.current === token) { setPolicy(result); if (selected) await select(selected); } }
    catch (reason) { fail(reason, token); }
    finally { if (current.current === token) { token.busy = false; setBusy(false); } }
  }
  if (unauthenticated) return <Link href="/auth/sign-in?returnTo=/qa">{c.signIn}</Link>;
  const waiting = messages.some(message => message.status === "pending");
  return <main className={styles.workspace} lang={locale === "zh" ? "zh-CN" : "en"}>
    <aside className={styles.sessions} aria-label={c.sessions}>
      <h1>{c.sessions}</h1><button type="button" disabled={busy || loading} onClick={() => void create()}>{c.new}</button>
      <ul>{sessions.map(session => <li key={session.id}><button type="button" aria-current={selected === session.id ? "true" : undefined} onClick={() => void select(session.id)}>{(session.label && session.label !== "Session") ? session.label : `Session ${session.id}`}</button></li>)}</ul>
    </aside>
    <section className={styles.chat} aria-label="Agent QA">
      {error ? <div role="alert"><p>{c.error}</p><button type="button" disabled={busy} onClick={() => { if (selected && policy) void select(selected); else window.location.reload(); }}>{c.refresh}</button></div> : null}
      {loading ? <p role="status">{c.loading}</p> : null}
      <div className={styles.messages} role="log" aria-live="polite" aria-relevant="additions text">
        {!selected ? <p>{c.empty}</p> : null}
        {messages.map(message => <article key={message.requestId}>
          <p><strong>{c.you}</strong></p><p className={styles.text}>{message.text}</p>
          {message.status === "pending" ? <p role="status">{c.replying}</p> : message.status === "technical_failure" || message.status === "blocked" ? <p role="alert">{message.status === "blocked" ? c.blocked : c.failure}</p> : <>
            <p><strong>{c.assistant}</strong>{message.status === "partial" ? ` · ${c.partial}` : message.status === "clarification" ? ` · ${c.clarification}` : ""}</p>
            <p className={styles.text}>{message.answer}</p>
          </>}
        </article>)}<div ref={scroll} />
      </div>
      {policy ? <div className={styles.notice}><p className={styles.text}>{locale === "zh" ? policy.noticeZh : policy.noticeEn}</p>{!policy.consented ? <button type="button" disabled={busy} onClick={() => void consent()}>{c.consent}</button> : null}</div> : null}
      {pending ? <div role="status"><p>{forbidden ? c.forbidden : c.unknown}</p><button type="button" disabled={busy} onClick={() => void submit(!pending.retryAllowed)}>{pending.retryAllowed ? c.retry : c.recover}</button></div> : null}
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); if (!pending) void submit(); }}>
        <label htmlFor="qa-message">{c.input}</label>
        <textarea maxLength={4000} id="qa-message" value={text} disabled={!selected || loading || busy || !historyReady || !!pending || waiting} onChange={event => setText(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); if (!pending && !waiting) void submit(); }
        }} />
        <button type="submit" disabled={!selected || loading || !historyReady || busy || !!pending || waiting || !policy?.consented || !text.trim()}>{busy || waiting ? c.replying : c.send}</button>
      </form>
    </section>
  </main>;
}
