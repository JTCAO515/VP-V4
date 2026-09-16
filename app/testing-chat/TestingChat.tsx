"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { createPasswordAuthClient } from "@/lib/server/identity/browser-auth-client";

type AuthState = { status: "checking" | "signedOut" | "signedIn"; ownerId: string | null };
type Policy = { noticeZh: string; noticeEn: string; consentState: "not_accepted" | "withdrawn" | "accepted" };
type Message = {
  id: string; role: "user" | "assistant"; text: string;
  status?: "pending" | "error";
  result?: { intent: string; requestScope: string; knowledge: unknown } | null;
};
const CITIES = [
  { value: "shanghai", label: "上海 Shanghai" },
  { value: "beijing", label: "北京 Beijing" },
  { value: "guangzhou", label: "广州 Guangzhou" },
  { value: "chongqing", label: "重庆 Chongqing" },
] as const;

export function TestingChat({ signInFallback }: { signInFallback: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: "checking", ownerId: null });

  useEffect(() => {
    const client = createPasswordAuthClient();
    if (!client) { setAuth({ status: "signedOut", ownerId: null }); return; }
    let active = true;
    let authChanged = false;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      authChanged = true;
      // UI routing only; every testing-chat API still authenticates on the server.
      const ownerId = session?.user?.id ?? null;
      setAuth({ status: ownerId ? "signedIn" : "signedOut", ownerId });
    });
    void client.auth.getClaims().then(({ data, error }) => {
      if (active && !authChanged) {
        const ownerId = !error && typeof data?.claims?.sub === "string" ? data.claims.sub : null;
        setAuth({ status: ownerId ? "signedIn" : "signedOut", ownerId });
      }
    }).catch(() => { if (active && !authChanged) setAuth({ status: "signedOut", ownerId: null }); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  if (auth.status === "checking") return <main style={{ padding: 24 }}>Loading…</main>;
  if (auth.status === "signedOut") return <>{signInFallback}</>;
  // Remount all consent/chat state on account replacement, even without a sign-out event.
  return <ConsentGate key={auth.ownerId} />;
}

function ConsentGate() {
  const [policy, setPolicy] = useState<Policy | "loading" | "error">("loading");
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/testing-chat/policy").then((r) => r.json()).then((body) => {
      if (active) setPolicy(body.data ? body.data.policy : "error");
    }).catch(() => { if (active) setPolicy("error"); });
    return () => { active = false; };
  }, []);

  if (policy === "loading") return <main style={{ padding: 24 }}>Loading…</main>;
  if (policy === "error") return <main style={{ padding: 24 }}>Testing chat is unavailable.</main>;
  if (policy.consentState === "accepted") return <ChatRoom />;

  async function accept() {
    setAccepting(true);
    const r = await fetch("/api/testing-chat/consent", { method: "POST" });
    setAccepting(false);
    if (r.ok) setPolicy({ ...(policy as Policy), consentState: "accepted" });
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20 }}>VisePanda 内部测试 · Internal Testing</h1>
      <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{(policy as Policy).noticeZh}</p>
      <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, color: "#555" }}>{(policy as Policy).noticeEn}</p>
      <button onClick={accept} disabled={accepting} style={{ marginTop: 16, padding: "10px 20px" }}>
        {accepting ? "…" : "我同意 / I agree"}
      </button>
    </main>
  );
}

function ChatRoom() {
  const [city, setCity] = useState<typeof CITIES[number]["value"]>("shanghai");
  const [locale, setLocale] = useState<"zh" | "en">("zh");
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = text.trim();
    if (!question || sending) return;
    setText("");
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", text: question };
    const pendingId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMessage, { id: pendingId, role: "assistant", text: "…", status: "pending" }]);
    setSending(true);
    try {
      const r = await fetch("/api/testing-chat/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: question, locale, city }),
      });
      const body = await r.json();
      setMessages((prev) => prev.map((m) => m.id === pendingId ? toAssistantMessage(pendingId, r.ok, body) : m));
    } catch {
      setMessages((prev) => prev.map((m) => m.id === pendingId ? { ...m, status: "error" as const, text: "网络错误 / network error" } : m));
    } finally {
      setSending(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20 }}>VisePanda 内部测试聊天 · Internal Testing Chat</h1>
      <p style={{ color: "#777", fontSize: 13 }}>
        This exercises the real production grounded-turn pipeline. It classifies your question and, for a
        small set of supported topics, returns a structured answer — it does not yet write free-form prose replies.
      </p>
      <div style={{ display: "flex", gap: 12, margin: "12px 0" }}>
        <label>城市/City: <select value={city} onChange={(e) => setCity(e.target.value as typeof city)}>
          {CITIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select></label>
        <label>语言/Locale: <select value={locale} onChange={(e) => setLocale(e.target.value as "zh" | "en")}>
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select></label>
      </div>
      <div style={{ border: "1px solid #ddd", borderRadius: 8, minHeight: 300, padding: 12, marginBottom: 12 }}>
        {messages.length === 0 ? <p style={{ color: "#999" }}>还没有消息 / No messages yet.</p> : null}
        {messages.map((m) => (
          <div key={m.id} style={{ margin: "8px 0", textAlign: m.role === "user" ? "right" : "left" }}>
            <div style={{
              display: "inline-block", maxWidth: "85%", padding: "8px 12px", borderRadius: 10,
              background: m.role === "user" ? "#dbeafe" : m.status === "error" ? "#fee2e2" : "#f3f4f6",
            }}>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.text}</p>
              {m.result?.knowledge ? (
                <pre style={{ marginTop: 8, fontSize: 12, whiteSpace: "pre-wrap", background: "#fff", padding: 8, borderRadius: 6 }}>
                  {JSON.stringify(m.result.knowledge, null, 2)}
                </pre>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="输入你的问题…"
          style={{ flex: 1, padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
        />
        <button type="submit" disabled={sending || !text.trim()} style={{ padding: "10px 20px" }}>
          {sending ? "…" : "发送 / Send"}
        </button>
      </form>
    </main>
  );
}

function toAssistantMessage(id: string, ok: boolean, body: unknown): Message {
  if (!ok || !body || typeof body !== "object") {
    const code = body && typeof body === "object" && "error" in body ? String((body as Record<string, unknown>).error) : "UNAVAILABLE";
    return { id, role: "assistant", status: "error", text: `[${code}]` };
  }
  const data = (body as Record<string, unknown>).data as Record<string, unknown> | undefined;
  const result = data?.result as { intent?: string; requestScope?: string; knowledge?: unknown } | undefined;
  const outcome = typeof data?.outcome === "string" ? data.outcome : "unknown";
  const intent = result?.intent ?? "unknown";
  return {
    id, role: "assistant",
    text: `outcome: ${outcome} · intent: ${intent}`,
    result: result ? { intent: intent as string, requestScope: String(result.requestScope), knowledge: result.knowledge } : null,
  };
}
