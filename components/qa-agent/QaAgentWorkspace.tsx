"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPasswordAuthClient } from "@/lib/server/identity/browser-auth-client";
import { ApiError, permitsQaSubmission, qaApi, retryableHistoryError, type Message, type Policy, type Session } from "./api";
import { clearPendingIdentities, confirmPendingIdentity, PendingIdentityStorageError, readPendingIdentities, rememberPendingIdentity } from "./pending-identity";
import styles from "./QaAgentWorkspace.module.css";

const copy = {
  zh: { sessions: "会话", new: "新会话", empty: "选择或新建会话", input: "输入消息", send: "发送", loading: "正在读取…", replying: "正在回复…", error: "暂时无法完成请求，请检查原请求状态。", reconciliation: "答复暂无法确认；为避免重复处理，这条问题不会自动重发。可稍后再次查看。", checkReply: "再次查看", recover: "检查原请求", retry: "重发原请求", forbidden: "无法读取原请求。重发仍使用原请求编号，由服务器核验权限及幂等性。", readPaused: "自动读取已暂停，请点击“重新读取”检查原回复。", storageBlocked: "无法安全保存请求恢复标识，已暂停新发送。请重新读取。", restoredPending: "原请求尚未确认。仅保存了恢复标识，请继续检查原请求；不会发送替代请求。", refresh: "重新读取", signIn: "登录", limit: "本会话已达到上下文容量限制。请新建会话并缩短提问。", unsupportedPolicy: "当前会话尚未获得连续对话授权，暂时无法发送。", consent: "同意以上说明", unknown: "发送结果尚未确认。原请求编号已保留。", you: "你", assistant: "助手", blocked: "请求被阻止", failure: "请求未完成", partial: "部分答复", clarification: "需要补充信息" },
  en: { sessions: "Sessions", new: "New session", empty: "Select or create a session", input: "Message", send: "Send", loading: "Loading…", replying: "Replying…", error: "The request could not be completed. Check the original request status.", reconciliation: "The reply cannot be confirmed yet. To avoid duplicate processing, this question will not be resent automatically. You can check again later.", checkReply: "Check again", recover: "Check original request", retry: "Resend original request", forbidden: "The original request is unavailable. Resending keeps its original ID; the server verifies permission and idempotency.", readPaused: "Automatic reading has paused. Click Reload to check the original reply.", storageBlocked: "Request recovery storage is unavailable. New sending is paused. Please click Reload.", restoredPending: "Original delivery is unconfirmed. Only its recovery ID was saved. Keep checking the original request; no replacement will be sent.", refresh: "Reload", signIn: "Sign in", limit: "This session has reached its context capacity limit. Please start a new session with a shorter question.", unsupportedPolicy: "This session is not yet authorized for ongoing conversation. Sending is unavailable.", consent: "Agree to the notice above", unknown: "Delivery is unconfirmed. The original request ID is retained.", you: "You", assistant: "Assistant", blocked: "Request blocked", failure: "Request incomplete", partial: "Partial answer", clarification: "More information needed" },
};
type Pending = { requestId: string; text: string | null; retryAllowed: boolean };

export function QaAgentWorkspace() {
  const params = useSearchParams();
  const locale = params.get("locale") === "en" ? "en" : "zh";
  const [actor, setActor] = useState<string | null>(null);
  const authActor = useRef<string | null>(null);
  useEffect(() => {
    const client = createPasswordAuthClient();
    if (!client) { setActor("unavailable"); return; }
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? "signed-out";
      if (next === "signed-out" || (authActor.current !== null && authActor.current !== next)) {
        try { clearPendingIdentities(); } catch { /* Next actor hydration stays fail closed. */ }
      }
      authActor.current = next; setActor(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  if (actor === null) return <p role="status">{copy[locale].loading}</p>;
  if (actor === "signed-out") return <Link href="/auth/sign-in?returnTo=/qa">{copy[locale].signIn}</Link>;
  if (actor === "unavailable") return <p role="alert">{copy[locale].error}</p>;
  return <Workspace key={actor} locale={locale} actorId={actor} initialSession={params.get("session")} />;
}

function Workspace({ locale, actorId, initialSession }: { locale: "zh" | "en"; actorId: string; initialSession: string | null }) {
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
  const [pollPaused, setPollPaused] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingBySession = useRef(new Map<string, Pending>());
  const limitedSessions = useRef(new Set<string>());
  const reconciling = messages.some(message => message.status === "reconciliation_required");
  const atLimit = limitReached || (policy?.maxTurns != null && messages.length >= policy.maxTurns);
  const mounted = useRef(true);
  const current = useRef<{ epoch: number; controller: AbortController; busy: boolean }>({ epoch: 0, controller: new AbortController(), busy: false });
  const scroll = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  function hydratePending() {
    try {
      for (const identity of readPendingIdentities(actorId)) {
        const original = pendingBySession.current.get(identity.sessionId);
        if (!original || original.requestId !== identity.requestId) pendingBySession.current.set(identity.sessionId, { requestId: identity.requestId, text: null, retryAllowed: false });
      }
      setStorageReady(true);
    } catch { setStorageReady(false); }
  }
  function confirm(id: string, requestId: string) {
    try { confirmPendingIdentity(actorId, { sessionId: id, requestId }); }
    catch { setStorageReady(false); }
    pendingBySession.current.delete(id); setPending(null);
  }
  function scope() {
    current.current.controller.abort();
    current.current = { epoch: current.current.epoch + 1, controller: new AbortController(), busy: false };
    setBusy(false); setPollPaused(false);
    return current.current;
  }
  function fail(reason: unknown, token: typeof current.current) {
    if (current.current !== token || token.controller.signal.aborted) return;
    if (reason instanceof ApiError && reason.status === 401) {
      try { clearPendingIdentities(); } catch { setStorageReady(false); }
      pendingBySession.current.clear(); limitedSessions.current.clear(); setLimitReached(false); setMessages([]); setSessions([]); setPolicy(null); setPending(null); setUnauthenticated(true);
    } else {
      if (reason instanceof ApiError && reason.code === "DATA_POLICY_BLOCKED") {
        // Protected history may require consent to the already-read notice.
        // Keep that notice/action available; denial never grants send readiness.
        setMessages([]); setHistoryReady(false);
      }
      setError(true);
    }
  }
  useEffect(() => {
    mounted.current = true;
    const token = scope(); hydratePending();
    void Promise.all([qaApi.sessions(token.controller.signal), qaApi.policy(token.controller.signal)])
      .then(([list, notice]) => { if (current.current === token && !token.controller.signal.aborted) { setSessions(list.sessions); setPolicy(notice);
        if (initialSession) void select(initialSession); } })
      .catch(reason => fail(reason, token)).finally(() => { if (!token.controller.signal.aborted) setLoading(false); });
    return () => { mounted.current = false; current.current.controller.abort(); };
  }, []);
  useEffect(() => { scroll.current?.scrollIntoView({ block: "end" }); }, [messages, pending]);
  async function select(id: string) {
    if (!mounted.current) return;
    const token = scope(); hydratePending();
    const url = new URL(window.location.href); url.searchParams.set("session", id); window.history.replaceState(null, "", url);
    setSelected(id); setLimitReached(limitedSessions.current.has(id)); setHistoryReady(false); setMessages([]); if (selected !== id) setText(""); setError(false); setForbidden(false); setLoading(true); setPending(pendingBySession.current.get(id) ?? null);
    try {
      const history = await qaApi.history(id, token.controller.signal);
      if (current.current !== token || token.controller.signal.aborted) return;
      setMessages(history.messages); setHistoryReady(true);
      setSessions(list => list.some(session => session.id === history.session.id)
        ? list.map(session => session.id === history.session.id ? history.session : session)
        : [history.session, ...list]);
      const original = pendingBySession.current.get(id);
      if (original && history.messages.some(message => message.requestId === original.requestId)) confirm(id, original.requestId);
    } catch (reason) { fail(reason, token); }
    finally { if (current.current === token && !token.controller.signal.aborted) setLoading(false); }
  }
  async function create() {
    if (!mounted.current) return;
    if (current.current.busy) return;
    const token = scope(); token.busy = true; setBusy(true); setError(false);
    try {
      const result = await qaApi.create(token.controller.signal);
      if (current.current !== token || token.controller.signal.aborted) return;
      setSessions(list => [result.session, ...list.filter(item => item.id !== result.session.id)]);
      await select(result.session.id);
    } catch (reason) { fail(reason, token); }
    finally { if (current.current === token && !token.controller.signal.aborted) { token.busy = false; setBusy(false); } }
  }
  async function submit(recover = false) {
    if (!mounted.current) return;
    if (!recover && reconciling) return;
    if (!selected || loading || (!recover && !historyReady) || current.current.busy || messages.some(message => message.status === "pending") || !policy?.consented || (!recover && !permitsQaSubmission(policy))) return;
    const id = selected;
    const retained = pendingBySession.current.get(id);
    if ((recover && !retained) || (!recover && !storageReady)) return;
    // Read/replay the original identity even at capacity; never admit a new one.
    if (!recover && atLimit && !retained) return;
    const original = retained ?? { requestId: crypto.randomUUID(), text, retryAllowed: false };
    if (!recover && (!storageReady || original.text === null || !original.text.trim())) return;
    const token = current.current; token.busy = true; setBusy(true); setError(false);
    try {
      if (!recover) rememberPendingIdentity(actorId, { sessionId: id, requestId: original.requestId });
      pendingBySession.current.set(id, original); setPending(original);
      const result = recover
        ? await qaApi.recover(id, original.requestId, token.controller.signal)
        : await qaApi.send(id, { requestId: original.requestId, text: original.text! }, token.controller.signal);
      if (current.current !== token || token.controller.signal.aborted) return;
      setMessages(list => [...list.filter(message => message.requestId !== result.message.requestId), result.message]);
      confirm(id, original.requestId); setText("");
    } catch (reason) {
      if (current.current !== token || token.controller.signal.aborted) return;
      if (reason instanceof PendingIdentityStorageError) { setStorageReady(false); setError(true); }
      else if (!recover && reason instanceof ApiError && reason.status === 409 && reason.code === "QA_CONTEXT_LIMIT" && reason.ack === "not_submitted") {
        limitedSessions.current.add(id); setLimitReached(true);
        if (!retained) confirm(id, original.requestId);
      } else if (recover && reason instanceof ApiError && reason.status === 403 && reason.code === "FORBIDDEN") {
        setForbidden(true);
        const retry = { ...original, retryAllowed: original.text !== null }; pendingBySession.current.set(id, retry); setPending(retry);
      } else {
        if (!recover && !retained && reason instanceof ApiError && reason.ack === "not_submitted") confirm(id, original.requestId);
        fail(reason, token);
      }
    } finally { if (current.current === token && !token.controller.signal.aborted) { token.busy = false; setBusy(false); } }
  }
  async function inspectOriginal(requestId: string) {
    if (!mounted.current || !selected || loading || current.current.busy || !policy?.consented) return;
    const id = selected, token = current.current;
    token.busy = true; setBusy(true); setError(false);
    try {
      // Saved admission identity is durable; this action never POSTs or replays.
      const result = await qaApi.recover(id, requestId, token.controller.signal);
      if (current.current !== token || token.controller.signal.aborted) return;
      setMessages(list => list.map(message => message.requestId === requestId ? result.message : message));
      if (pendingBySession.current.get(id)?.requestId === requestId) confirm(id, requestId);
    } catch (reason) {
      if (current.current !== token || token.controller.signal.aborted) return;
      if (!retryableHistoryError(reason)) {
        setMessages([]); setHistoryReady(false);
        if (reason instanceof ApiError && reason.status === 403) setSessions(list => list.filter(session => session.id !== id));
      }
      fail(reason, token);
    } finally { if (current.current === token && !token.controller.signal.aborted) { token.busy = false; setBusy(false); } }
  }
  // Successful pending reads keep polling. Only consecutive temporary GET
  // failures receive three bounded retries; no admission/POST happens here.
  useEffect(() => {
    if (!selected || !messages.some(message => message.status === "pending")) return;
    const token = current.current;
    const sessionId = selected;
    const controller = new AbortController();
    const signal = AbortSignal.any([token.controller.signal, controller.signal]);
    let disposed = false, retries = 0, timer: number | undefined;
    const active = () => !disposed && current.current === token && !signal.aborted;
    const schedule = (delay: number) => { timer = window.setTimeout(() => { void read(); }, delay); };
    async function read() {
      if (!active()) return;
      try {
        const history = await qaApi.history(sessionId, signal);
        if (!active()) return;
        setError(false); setPollPaused(false); setMessages(history.messages);
        const unresolved = pendingBySession.current.get(sessionId);
        if (unresolved && history.messages.some(message => message.requestId === unresolved.requestId)) confirm(sessionId, unresolved.requestId);
      } catch (reason) {
        if (!active()) return;
        const retryable = retryableHistoryError(reason);
        if (retryable && retries < 3) { schedule(1000 * 2 ** retries++); return; }
        if (retryable) setPollPaused(true);
        else {
          setMessages([]); setHistoryReady(false);
          if (reason instanceof ApiError && reason.status === 403) {
            pendingBySession.current.delete(sessionId); setPending(null);
            setSessions(list => list.filter(session => session.id !== sessionId));
          }
        }
        fail(reason, token);
      }
    }
    schedule(2000);
    return () => { disposed = true; controller.abort(); window.clearTimeout(timer); };
  }, [selected, messages]);
  async function consent() {
    if (!mounted.current) return;
    if (!policy || policy.contextMode !== "qa_session_history_v1" || current.current.busy) return;
    const token = current.current; token.busy = true; setBusy(true);
    try { const result = await qaApi.consent(policy, token.controller.signal); if (current.current === token && !token.controller.signal.aborted) { setPolicy(result); if (selected) await select(selected); } }
    catch (reason) { fail(reason, token); }
    finally { if (current.current === token && !token.controller.signal.aborted) { token.busy = false; setBusy(false); } }
  }
  if (unauthenticated) return <Link href="/auth/sign-in?returnTo=/qa">{c.signIn}</Link>;
  const waiting = messages.some(message => message.status === "pending");
  return <main className={styles.workspace} lang={locale === "zh" ? "zh-CN" : "en"}>
    <aside className={styles.sessions} aria-label={c.sessions}>
      <h1>{c.sessions}</h1><button type="button" disabled={busy || loading} onClick={() => void create()}>{c.new}</button>
      <ul>{sessions.map(session => <li key={session.id}><button type="button" aria-current={selected === session.id ? "true" : undefined} onClick={() => void select(session.id)}>{(session.label && session.label !== "Session") ? session.label : `Session ${session.id}`}</button></li>)}</ul>
    </aside>
    <section className={styles.chat} aria-label="Agent QA">
      {error || (!storageReady && !loading) ? <div role="alert"><p>{!storageReady ? c.storageBlocked : pollPaused ? c.readPaused : c.error}</p><button type="button" disabled={busy} onClick={() => { if (selected && policy) void select(selected); else window.location.reload(); }}>{c.refresh}</button></div> : null}
      {loading ? <p role="status">{c.loading}</p> : null}
      <div className={styles.messages} role="log" aria-live="polite" aria-relevant="additions text">
        {!selected ? <p>{c.empty}</p> : null}
        {messages.map(message => <article key={message.requestId}>
          <p><strong>{c.you}</strong></p><p className={styles.text}>{message.text}</p>
          {message.status === "pending" ? <p role="status">{c.replying}</p> : message.status === "reconciliation_required" ? <div><p role="status">{c.reconciliation}</p><button type="button" disabled={busy || loading} onClick={() => void inspectOriginal(message.requestId)}>{c.checkReply}</button></div> : message.status === "technical_failure" || message.status === "blocked" ? <p role="alert">{message.status === "blocked" ? c.blocked : c.failure}</p> : <>
            <p><strong>{c.assistant}</strong>{message.status === "partial" ? ` · ${c.partial}` : message.status === "clarification" ? ` · ${c.clarification}` : ""}</p>
            <p className={styles.text}>{message.answer}</p>
          </>}
        </article>)}<div ref={scroll} />
      </div>
      {policy ? <div className={styles.notice}><p className={styles.text}>{locale === "zh" ? policy.noticeZh : policy.noticeEn}</p>{policy.contextMode !== "qa_session_history_v1" ? <p role="status">{c.unsupportedPolicy}</p> : !policy.consented ? <button type="button" disabled={busy} onClick={() => void consent()}>{c.consent}</button> : null}</div> : null}
      {atLimit ? <p role="status">{c.limit}</p> : null}
      {pending ? <div role="status"><p>{pending.text === null ? c.restoredPending : forbidden ? c.forbidden : c.unknown}</p><button type="button" disabled={busy || loading || (!reconciling && pending.retryAllowed && (!storageReady || !permitsQaSubmission(policy)))} onClick={() => void submit(reconciling || !pending.retryAllowed)}>{!reconciling && pending.retryAllowed ? c.retry : c.recover}</button></div> : null}
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); if (!pending) void submit(); }}>
        <label htmlFor="qa-message">{c.input}</label>
        <textarea maxLength={4000} id="qa-message" value={text} disabled={!selected || loading || busy || !historyReady || !!pending || waiting || atLimit || reconciling || !storageReady} onChange={event => setText(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) { event.preventDefault(); if (!pending && !waiting) void submit(); }
        }} />
        <button type="submit" disabled={!selected || loading || !historyReady || busy || !!pending || waiting || !permitsQaSubmission(policy) || atLimit || reconciling || !storageReady || !text.trim()}>{waiting || (busy && !reconciling) ? c.replying : c.send}</button>
      </form>
    </section>
  </main>;
}
