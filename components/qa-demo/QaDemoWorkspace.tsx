"use client";

import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { fixtures, prompts, sampleReply, type SampleMessage } from "./fixtures";
import styles from "./QaDemoWorkspace.module.css";

const sections = ["VP", "Journeys", "Library", "Memory"] as const;

export function QaDemoWorkspace() {
  const [selected, setSelected] = useState(0);
  const [histories, setHistories] = useState<SampleMessage[][]>(() => fixtures.map(f => [...f.messages]));
  const [text, setText] = useState("");
  const [section, setSection] = useState<typeof sections[number]>("VP");
  const [status, setStatus] = useState("已载入固定示例，未恢复任何真实 Session。");
  const input = useRef<HTMLTextAreaElement>(null);
  const resetButton = useRef<HTMLButtonElement>(null);
  const focusRequested = useRef(false);
  const fixture = fixtures[selected];
  const messages = histories[selected];
  const atLimit = messages.length >= 26;

  useLayoutEffect(() => {
    if (!focusRequested.current) return;
    focusRequested.current = false;
    if (section === "VP") {
      (atLimit ? resetButton.current : input.current)?.focus();
    }
  }, [histories, section, atLimit]);

  function submit(value: string) {
    if (!value.trim() || atLimit) return;
    focusRequested.current = true;
    setHistories(current => current.map((history, index) => index === selected
      ? [...history, { role: "user", text: value.trim() }, { role: "sample", text: sampleReply(fixture, value) }]
      : history));
    setText("");
    setStatus("已展示预设示例回应；未连接 Agent、未发送或保存数据。");
  }
  function onSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); submit(text); }
  function reset() {
    focusRequested.current = section === "VP";
    setHistories(current => current.map((history, index) => index === selected ? [...fixture.messages] : history));
    setText("");
    setStatus("当前示例已重置到固定初始数据；没有真实 Session 被删除或恢复。");
  }

  return <main className={styles.shell}>
    <header className={styles.banner}>
      <h1>Session 示例 · Sample / 未连接真实 Agent</h1>
      <p>模拟许可范围：仅查看两组 synthetic fixtures 和预设交互。无用户数据、无模型选择、无费用或真实任务。</p>
      <p>状态仅在当前页面内存中；刷新回到示例 A，重置只恢复当前示例。请勿输入个人信息。</p>
      <a href="/qa">进入真实 QA（需原登录与许可） →</a>
    </header>
    <nav className={styles.navigation} aria-label="样例分区">
      {sections.map(item => <button key={item} type="button" aria-current={section === item ? "page" : undefined} onClick={() => setSection(item)}>{item}</button>)}
    </nav>
    <div className={styles.workspace}>
      <aside className={styles.sessions} aria-label="示例会话">
        <h2>示例 Session</h2>
        {fixtures.map((item, index) => <button key={item.id} type="button" aria-current={selected === index ? "true" : undefined} onClick={() => { setSelected(index); setText(""); setStatus(`已切换到 ${item.source}；仅使用本页内存中的示例。`); }}>{item.name}</button>)}
        <p>{fixture.source} · 静态合成内容</p>
        <button ref={resetButton} type="button" onClick={reset}>重置当前示例 / Reset</button>
      </aside>
      <section className={styles.chat} aria-label={`${section} 示例内容`}>
        {section === "VP" ? <>
          <h2>{fixture.name}</h2>
          <div className={styles.messages} role="log" aria-label="示例消息" aria-live="polite" aria-relevant="additions">
            {messages.map((message, index) => <article key={`${fixture.id}-${index}`}>
              <strong>{message.role === "user" ? "示例输入" : "示例回应 · 未连接 Agent"}</strong>
              <p>{message.text}</p>
            </article>)}
          </div>
          <div className={styles.prompts} aria-label="预设示例问题">
            {prompts.map(prompt => <button key={prompt.key} type="button" disabled={atLimit} onClick={() => submit(prompt.key)}>{prompt.label}</button>)}
          </div>
          <form className={styles.composer} onSubmit={onSubmit}>
            <label htmlFor="sample-question">输入预设问题 / Sample question</label>
            <textarea ref={input} id="sample-question" value={text} maxLength={300} disabled={atLimit} aria-describedby="sample-scope" onChange={event => setText(event.target.value)} />
            <p id="sample-scope">仅匹配 why、simplify、correction 或对应中文。其他输入只显示未接入提示；最多 12 次交互后请重置。</p>
            <button type="submit" disabled={!text.trim() || atLimit}>查看示例回应</button>
          </form>
          {atLimit ? <p role="status">已达本页示例交互上限，请重置当前示例。</p> : null}
        </> : <div className={styles.placeholder}>
          <h2>{section} · 示例空状态</h2>
          <p>此分区仅展示四 Tab 入口，尚未连接真实能力。没有已保存的{section === "Journeys" ? "行程或 Proposal" : section === "Library" ? "成果" : "Memory"}。</p>
          <button type="button" onClick={() => { focusRequested.current = true; setSection("VP"); }}>返回 VP 示例对话</button>
        </div>}
        <p className={styles.status} role="status">{status}</p>
      </section>
    </div>
  </main>;
}
