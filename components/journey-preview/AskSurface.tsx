"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Lang } from "@/lib/journey-preview/copy";
import { CANVAS } from "@/lib/journey-preview/canvas";
import { CONVERSATIONS } from "@/lib/journey-preview/chats";
import { DEMO_UI } from "@/lib/journey-preview/ui";
import type { CanvasDay, CanvasNode, ChatId, Localized } from "@/lib/journey-preview/types";
import ImportInspector from "./ImportInspector";
import { ConfidenceTag, EvidenceRow, StateBadge } from "./parts";

type Decision = "accepted" | "rejected";
type Tab = "timeline" | "map" | "bookings";

type Props = {
  lang: Lang;
  chatId: ChatId;
  onToast: (message: string) => void;
  onOpenMemory: (memoryId: string) => void;
  onOpenDishes: () => void;
  onOpenTool: (toolId: string) => void;
  forceDiff?: boolean;
  placeRequest?: { text: Localized; requestId: number } | null;
};

const KIND_GLYPH: Record<CanvasNode["kind"], string> = {
  sight: "◇", food: "◍", transit: "→", stay: "▤", task: "✓",
};

/** Reveal turns up to and including the next one that offers clarifying chips. */
function nextStop(turns: { chips?: Localized[] }[], from: number) {
  for (let i = from; i < turns.length; i += 1) {
    if (turns[i].chips) return i + 1;
  }
  return turns.length;
}

/**
 * Every chat opens on at least two exchanges, so a visitor sees a conversation
 * rather than a single question. Always end on an assistant turn.
 */
function openingShown(turns: Array<{ role: "user" | "assistant"; chips?: Localized[] }>) {
  let shown = Math.min(turns.length, Math.max(nextStop(turns, 0), 4));
  if (turns[shown - 1]?.role === "user" && shown < turns.length) shown += 1;
  return shown;
}

export default function AskSurface({ lang, chatId, onToast, onOpenMemory, onOpenDishes, onOpenTool, forceDiff = false, placeRequest = null }: Props) {
  const doc = CANVAS[chatId];
  const turns = CONVERSATIONS[chatId];
  const ui = DEMO_UI;

  const [tab, setTab] = useState<Tab>("timeline");
  const [versionId, setVersionId] = useState(doc.versions.at(-1)?.id ?? "");
  const [diffOpen, setDiffOpen] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [shown, setShown] = useState(() => openingShown(turns));
  const [openNode, setOpenNode] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"canvas" | "chat">("chat");
  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState<string[]>([]);
  const [proposal, setProposal] = useState<string | null>(null);
  const [notes, setNotes] = useState<Array<{ id: number; text: string }>>([]);
  const nextNoteId = useRef(0);
  const messageEnd = useRef<HTMLDivElement>(null);
  const handledPlace = useRef<typeof placeRequest>(null);
  useEffect(() => {
    if (!placeRequest || handledPlace.current === placeRequest) return;
    handledPlace.current = placeRequest;
    setProposal(placeRequest.text[lang]);
    setLocalMessages((previous) => [...previous, placeRequest.text[lang]]);
    setMobilePane("chat");
  }, [placeRequest, lang]);
  useEffect(() => {
    if (localMessages.length) messageEnd.current?.scrollIntoView({ block: "nearest" });
  }, [localMessages.length]);

  useEffect(() => {
    if (!forceDiff || !doc.diff) return;
    setDiffOpen(true);
    setMobilePane("canvas");
  }, [doc.diff, forceDiff]);

  const pending = useMemo(
    () => (doc.diff?.entries ?? []).filter((entry) => !decisions[entry.id]).length,
    [doc.diff, decisions],
  );

  const decide = (id: string, decision: Decision) => {
    setDecisions((value) => ({ ...value, [id]: decision }));
    onToast(decision === "accepted" ? ui.canvas.applied[lang] : ui.canvas.rejectedNote[lang]);
  };

  const acceptAll = () => {
    setDecisions((previous) => {
      const all = { ...previous };
      (doc.diff?.entries ?? []).forEach((entry) => { if (!all[entry.id]) all[entry.id] = "accepted"; });
      return all;
    });
    onToast(ui.canvas.applied[lang]);
  };

  const visible = turns.slice(0, shown);
  const canAdvance = shown < turns.length;

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setLocalMessages((previous) => [...previous, text]);
    setProposal(text);
    setInput("");
  };

  return (
    <div className="demo-ask-layout">
      <nav className="vp-mobile-pane-switch" aria-label={ui.ability.ask[lang]}>
        <button className={mobilePane === "chat" ? "active" : ""} onClick={() => setMobilePane("chat")}>Ask</button>
        <button className={mobilePane === "canvas" ? "active" : ""} onClick={() => setMobilePane("canvas")}>Trip Canvas</button>
      </nav>

      <section className={`demo-canvas pane-${mobilePane}`} aria-label="Trip Canvas demo">
        <header>
          <div><span>{doc.title[lang]}</span><small>{doc.subtitle[lang]}</small></div>
          <p className="vp-ability canvas-answer">{ui.ability.canvas[lang]}</p>
          {doc.versions.length > 1 ? (
            <label className="vp-version">
              <span>{ui.canvas.version[lang]}</span>
              <select value={versionId} onChange={(event) => { setVersionId(event.target.value); onToast(ui.canvas.restore[lang]); }}>
                {doc.versions.map((version) => <option key={version.id} value={version.id}>{version.label[lang]}</option>)}
              </select>
            </label>
          ) : null}
        </header>

        {doc.versions.length > 1 ? (
          <p className="vp-version-note">{doc.versions.find((version) => version.id === versionId)?.note[lang]}</p>
        ) : null}

        <div className="demo-canvas-tools">
          <button className={tab === "timeline" ? "active" : ""} onClick={() => setTab("timeline")}>{ui.canvas.timeline[lang]}</button>
          <button className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>{ui.canvas.map[lang]}</button>
          <button className={tab === "bookings" ? "active" : ""} onClick={() => setTab("bookings")}>{ui.canvas.bookings[lang]}</button>
        </div>

        <div className="demo-canvas-body">
        <p className="journey-preview-notice">{lang === "zh" ? "演示资料，非旅行事实。决策仅在本页暂存；刷新即重置。" : "Example content, not travel facts. Decisions stay in this page only; refresh resets them."}</p>
        <section className="journey-local-notes" aria-label={lang === "zh" ? "我的行程备注" : "My trip notes"}>
          <header><b>{lang === "zh" ? "我的行程备注" : "My trip notes"}</b><span>{lang === "zh" ? "本地预览" : "Local preview"}</span></header>
          {notes.length ? notes.map((note) => <div key={note.id}>
            <input aria-label={lang === "zh" ? "编辑备注" : "Edit note"} value={note.text} maxLength={600} onChange={(event) => setNotes((previous) => previous.map((item) => item.id === note.id ? { ...item, text: event.target.value } : item))} />
            <button onClick={() => setNotes((previous) => previous.filter((item) => item.id !== note.id))}>{lang === "zh" ? "移除" : "Remove"}</button>
          </div>) : <p>{lang === "zh" ? "在 Chat 写下想法，确认后会出现在这里。示例行程不会自动更改。" : "Write an idea in Chat, then confirm it here. The example itinerary stays unchanged."}</p>}
        </section>
        {doc.diff && pending > 0 && !diffOpen ? (
          <button className="vp-diff-banner" onClick={() => setDiffOpen(true)}>
            <b>{doc.diff.summary[lang]}</b>
            <span>{ui.canvas.nothingApplied[lang]}</span>
            <em>{ui.canvas.diffOpen[lang]}</em>
          </button>
        ) : null}

        {doc.diff && diffOpen ? (
          <section className="vp-diff" aria-label="Canvas diff">
            <header>
              <b>{doc.diff.summary[lang]}</b>
              <div>
                <button onClick={acceptAll} disabled={!pending}>{ui.canvas.acceptAll[lang]}</button>
                <button onClick={() => setDecisions({})}>{lang === "zh" ? "重置选择" : "Reset choices"}</button>
                <button onClick={() => setDiffOpen(false)}>{ui.canvas.diffClose[lang]}</button>
              </div>
            </header>
            {doc.diff.entries.map((entry) => {
              const decision = decisions[entry.id];
              return (
                <article key={entry.id} className={`vp-diff-entry op-${entry.op}${decision ? ` ${decision}` : ""}`}>
                  <span className="vp-diff-op">{entry.op === "add" ? "+" : entry.op === "remove" ? "−" : "⇄"}</span>
                  <div>
                    <strong>{entry.target[lang]}</strong>
                    <small>{entry.detail[lang]}</small>
                    <p><b>{ui.canvas.reason[lang]}</b>{entry.reason[lang]}</p>
                    <p><b>{ui.canvas.trigger[lang]}</b>{entry.trigger[lang]}</p>
                  </div>
                  {decision ? (
                    <span className="vp-diff-done">{decision === "accepted" ? ui.canvas.accepted[lang] : ui.canvas.rejected[lang]}</span>
                  ) : (
                    <div className="vp-diff-actions">
                      <button onClick={() => decide(entry.id, "accepted")}>{ui.canvas.accept[lang]}</button>
                      <button onClick={() => decide(entry.id, "rejected")}>{ui.canvas.reject[lang]}</button>
                      <button onClick={() => onToast(ui.chat.anotherNote[lang])}>{ui.canvas.rework[lang]}</button>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        ) : null}

        {chatId === "import" ? <ImportInspector lang={lang} onReviewDiff={() => setDiffOpen(true)} /> : null}

        {tab === "timeline" ? (
          <div className="demo-canvas-rows">
            {doc.empty ? (
              <div className="vp-empty">
                <h4>{doc.empty.title[lang]}</h4>
                <p>{doc.empty.body[lang]}</p>
                <div>{doc.empty.options.map((option, index) => (
                  <button key={index} onClick={() => onToast(option[lang])}>{option[lang]}</button>
                ))}</div>
                <small>{ui.canvas.uploadTypes[lang]}</small>
              </div>
            ) : null}

            {doc.compare ? <CompareBlock lang={lang} doc={doc} /> : null}

            {doc.days.map((day) => (
              <DayBlock
                key={day.id}
                day={day}
                lang={lang}
                openNode={openNode}
                setOpenNode={setOpenNode}
                onToast={onToast}
                onOpenDishes={onOpenDishes}
                onOpenTool={onOpenTool}
              />
            ))}
          </div>
        ) : null}

        {tab === "map" ? <MapView doc={doc} lang={lang} /> : null}

        {tab === "bookings" ? (
          <div className="demo-bookings">
            {doc.bookings.length === 0 ? (
              <div className="vp-empty"><h4>{ui.canvas.emptyTitle[lang]}</h4><p>{ui.canvas.nothingApplied[lang]}</p></div>
            ) : doc.bookings.map((item) => (
              <article key={item.id}>
                <span>{item.label[lang]}</span>
                <div>
                  <strong>{item.title[lang]}</strong>
                  <StateBadge state={item.state} lang={lang} />
                </div>
                <button onClick={() => onToast(item.feedback[lang])}>{item.action[lang]}</button>
              </article>
            ))}
          </div>
        ) : null}
        </div>
      </section>

      <section className={`demo-chat pane-${mobilePane}`} aria-label="Chatbot demo">
        <header>
          <span>Ask VisePanda</span>
          <small>{ui.ability.ask[lang]}</small>
        </header>

        <div className="demo-messages">
          <p className="journey-preview-notice">{lang === "zh" ? "预设对话，不连接 AI。自由输入可体验添加本地行程备注。" : "Prepared conversations, no AI connection. Type freely to try adding a local trip note."}</p>
          {visible.map((turn, index) => (
            <article key={index} className={`message ${turn.role}`}>
              <small>{turn.role === "user" ? ui.chat.you[lang] : "VisePanda"}</small>
              <p>{turn.text[lang]}</p>

              {turn.recall ? (
                <button className="vp-recall" onClick={() => onOpenMemory(turn.recall!.memoryId)}>
                  <b>{turn.recall.label[lang]}</b>
                  <span>{turn.recall.value[lang]}</span>
                  <em>{ui.chat.viewMemory[lang]}</em>
                </button>
              ) : null}

              {turn.confidence ? <ConfidenceTag level={turn.confidence} lang={lang} /> : null}
              <EvidenceRow items={turn.evidence} lang={lang} />

              {turn.fallback ? (
                <div className="vp-fallback">
                  <b>{ui.chat.cannotConfirm[lang]}</b>
                  <p><span>{ui.chat.officialChannel[lang]}</span>{turn.fallback.channel[lang]}</p>
                  <p><span>{ui.chat.nextStep[lang]}</span>{turn.fallback.nextStep[lang]}</p>
                </div>
              ) : null}

              {turn.generating ? (
                <div className="vp-skeleton" aria-hidden="true">
                  <span>{ui.canvas.generating[lang]}</span>
                  <i /><i /><i />
                </div>
              ) : null}

              {turn.role === "assistant" && index === visible.length - 1 ? (
                <div className="vp-msg-actions">
                  <button onClick={async () => {
                    try { await navigator.clipboard.writeText(turn.text[lang]); onToast(ui.chat.copied[lang]); }
                    catch { onToast(lang === "zh" ? "复制未获浏览器许可，请选择文字复制。" : "Copy is unavailable. Select the text to copy it."); }
                  }}>{ui.chat.copy[lang]}</button>
                  <button onClick={() => onToast(ui.chat.anotherNote[lang])}>{ui.chat.another[lang]}</button>
                  <button onClick={() => onToast(ui.chat.wrongNote[lang])}>{ui.chat.wrong[lang]}</button>
                </div>
              ) : null}

              {turn.chips && index === visible.length - 1 && canAdvance ? (
                <div className="vp-chips">
                  <small>{ui.chat.pick[lang]}</small>
                  {turn.chips.map((chip, chipIndex) => (
                    <button key={chipIndex} onClick={() => setShown(nextStop(turns, shown))}>{chip[lang]}</button>
                  ))}
                </div>
              ) : null}
            </article>
          ))}

          {canAdvance && !visible.at(-1)?.chips ? (
            <button className="vp-continue" onClick={() => setShown(nextStop(turns, shown))}>
              {lang === "zh" ? "继续这段对话" : "Continue this conversation"}
            </button>
          ) : null}
          {localMessages.map((text, index) => <article className="message user" key={index}><small>{ui.chat.you[lang]}</small><p>{text}</p></article>)}
          {proposal ? <article className="message assistant journey-note-proposal">
            <small>{lang === "zh" ? "本地预览回复 · 非 AI" : "Local preview reply · not AI"}</small>
            <p>{lang === "zh" ? "把下面这句话作为备注加入当前 Canvas？这不会生成或重排真实行程。" : "Add this idea as a note to this Canvas? This does not generate or rearrange a real itinerary."}</p>
            <blockquote>{proposal}</blockquote>
            <div><button onClick={() => {
              setNotes((previous) => [...previous, { id: nextNoteId.current++, text: proposal }]);
              setProposal(null); setMobilePane("canvas");
              onToast(lang === "zh" ? "已添加本地备注，刷新后清除。" : "Local note added. Refresh clears it.");
            }}>{lang === "zh" ? "确认添加备注" : "Confirm note"}</button>
            <button onClick={() => setProposal(null)}>{lang === "zh" ? "暂不添加" : "Not now"}</button></div>
          </article> : null}
          <div ref={messageEnd} />
        </div>

        <form className="demo-composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
          <input aria-label={lang === "zh" ? "给行程写个备注" : "Write a trip note"} placeholder={lang === "zh" ? "想在旅途中留点时间给……" : "Leave a little time for…"} value={input} maxLength={600} onChange={(event) => setInput(event.target.value)} />
          <button type="submit" disabled={!input.trim()} aria-label={lang === "zh" ? "发送备注" : "Send note"}>↑</button>
        </form>
      </section>
    </div>
  );
}

function CompareBlock({ lang, doc }: { lang: Lang; doc: (typeof CANVAS)[ChatId] }) {
  const table = doc.compare!;
  return (
    <section className="vp-compare">
      <header><b>{table.caption[lang]}</b></header>
      <div className="vp-compare-scroll">
        <table>
          <thead>
            <tr>
              <th />
              {table.options.map((option, index) => <th key={index}>{option[lang]}</th>)}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={index}>
                <th>{row.field[lang]}</th>
                {row.values.map((value, valueIndex) => (
                  <td key={valueIndex} className={row.match === valueIndex ? "match" : ""}>{value[lang]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="vp-compare-mobile">
        {table.options.map((option, optionIndex) => (
          <article key={option.en}>
            <h4>{option[lang]}</h4>
            <dl>
              {table.rows.map((row) => (
                <div key={row.field.en} className={row.match === optionIndex ? "match" : ""}>
                  <dt>{row.field[lang]}</dt><dd>{row.values[optionIndex][lang]}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      <small>{table.footnote[lang]}</small>
    </section>
  );
}

function DayBlock({
  day, lang, openNode, setOpenNode, onToast, onOpenDishes, onOpenTool,
}: {
  day: CanvasDay; lang: Lang; openNode: string | null;
  setOpenNode: (id: string | null) => void;
  onToast: (message: string) => void;
  onOpenDishes: () => void;
  onOpenTool: (toolId: string) => void;
}) {
  const ui = DEMO_UI;
  return (
    <section className="vp-day">
      <header>
        <strong>{day.label[lang]}</strong>
        <span>{day.summary.walk[lang]}</span>
        <span>{day.summary.nodes[lang]}</span>
        <span>{day.summary.budget[lang]}</span>
        <span>{day.summary.indoor[lang]}</span>
      </header>

      {day.nodes.map((node) => {
        const open = openNode === node.id;
        return (
          <article key={node.id} className={`vp-node${node.time === "!" ? " warning" : ""}${open ? " open" : ""}`}>
            <time>{node.time}</time>
            <span className="demo-row-line" />
            <div>
              <button className="vp-node-head" onClick={() => setOpenNode(open ? null : node.id)}>
                <strong><i>{KIND_GLYPH[node.kind]}</i>{node.title[lang]}</strong>
                <StateBadge state={node.state} lang={lang} />
                {node.confidence ? <ConfidenceTag level={node.confidence} lang={lang} /> : null}
              </button>

              <dl className="vp-node-meta">
                {node.duration ? <div><dt>{ui.canvas.duration[lang]}</dt><dd>{node.duration[lang]}</dd></div> : null}
                {node.transfer ? <div><dt>{ui.canvas.transfer[lang]}</dt><dd>{node.transfer[lang]}</dd></div> : null}
                {node.cost ? <div><dt>{ui.canvas.cost[lang]}</dt><dd>{node.cost[lang]}</dd></div> : null}
              </dl>

              {open ? (
                <>
                  {node.risks?.length ? (
                    <ul className="vp-risks">
                      {node.risks.map((risk, index) => <li key={index}><b>{ui.canvas.risk[lang]}</b>{risk[lang]}</li>)}
                    </ul>
                  ) : null}
                  <EvidenceRow items={node.evidence} lang={lang} />
                </>
              ) : null}
            </div>

            {node.next ? (
              <button
                className="vp-node-action"
                onClick={() => {
                  if (node.next!.label.en === "View dishes") onOpenDishes();
                  else if (node.next!.label.en.includes("ride")) onOpenTool("ride");
                  else if (node.next!.label.en.includes("network")) onOpenTool("network");
                  onToast(node.next!.feedback[lang]);
                }}
              >
                {node.next.label[lang]}
              </button>
            ) : null}
          </article>
        );
      })}

      {day.stay ? <p className="vp-stay"><b>{ui.canvas.stay[lang]}</b>{day.stay[lang]}</p> : null}
    </section>
  );
}

function MapView({ doc, lang }: { doc: (typeof CANVAS)[ChatId]; lang: Lang }) {
  const nodes = doc.days.flatMap((day) => day.nodes).filter((node) => node.map);
  if (!nodes.length) {
    return <div className="demo-mini-map empty"><strong>{DEMO_UI.canvas.emptyTitle[lang]}</strong></div>;
  }
  const points = nodes.map((node) => ({ node, x: node.map!.x * 100, y: node.map!.y * 100 }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  return (
    <div className="demo-mini-map">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path className="vp-map-route" d={path} />
      </svg>
      {points.map((point, index) => (
        <span key={point.node.id} className={`vp-map-pin state-${point.node.state}`} style={{ left: `${point.x}%`, top: `${point.y}%` }}>
          <i>{index + 1}</i>
          <b>{point.node.title[lang]}</b>
        </span>
      ))}
      <strong>{DEMO_UI.canvas.mapCaption[lang]}</strong>
    </div>
  );
}
