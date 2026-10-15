"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { isUserAddressText } from "../../lib/trip-user-address";
import { sameAddressContext, type AddressContext } from "./context";
import { AddressReadController, type AddressState } from "./controller";
import { prepareAddress, type AddressPrepare } from "./proposal";
import { readOnlineAddresses, type AddressRead, type AddressReader } from "./read";
import styles from "./TripItemAddress.module.css";

const copy = {
  zh: { title: "地点地址", loading: "正在读取当前版本地址…", unavailable: "地址暂不可用", retry: "重新读取", source: "当前来源引用", chinese: "含中文地址文字", other: "原文地址（未识别为中文）", unknown: "原文地址（文字类型未知）", observation: "文字识别不代表地址真实性或翻译已经验证。", manual: "用户补充 · 未验证", missing: "未提供", edit: "补充或修改地址", input: "地址原文", limits: "最多 500 个 Unicode 字符、1500 UTF-8 字节；按原文保存。", invalid: "地址不能为空，且须符合长度与字符限制。", review: "在原提案中审阅变更", clear: "在原提案中审阅移除", cancel: "取消草稿", prepared: "地址变更已交原提案，请查看差异并明确确认。", failed: "提案状态暂不可用，请先在原提案中读取状态。", blocked: "请先处理当前提案或等待当前操作完成。", before: "变更前", after: "变更后", remove: "移除用户补充" },
  en: { title: "Place address", loading: "Reading the current version…", unavailable: "Address unavailable", retry: "Read again", source: "Current source reference", chinese: "Contains Chinese address text", other: "Original address (not identified as Chinese)", unknown: "Original address (script unknown)", observation: "Script observation does not verify physical accuracy or translation.", manual: "User provided · Unverified", missing: "Not provided", edit: "Add or edit address", input: "Original address text", limits: "Up to 500 Unicode scalars and 1500 UTF-8 bytes. Saved as entered.", invalid: "Enter an address within the length and character limits.", review: "Review change in the original proposal", clear: "Review removal in the original proposal", cancel: "Cancel draft", prepared: "Address change sent to the original proposal. Review its diff and explicitly confirm.", failed: "Proposal state unavailable. Read its status in the original proposal first.", blocked: "Resolve the current proposal or wait for the current operation.", before: "Before", after: "After", remove: "Remove user-provided addition" },
} as const;

export type TripItemAddressProps = {
  context: AddressContext;
  locale: "zh" | "en";
  /** Includes pending/rollback, unknown ACK, actor-root transition and all parent mutations. */
  blocked: boolean;
  /** Changes only after the parent authoritatively settles/cancels/reconciles its original Proposal. */
  settledEpoch: string;
  prepare: AddressPrepare;
  read?: AddressReader;
};

export function TripItemAddress(props: TripItemAddressProps) {
  // Keying clears draft, requests and notices synchronously on every identity/version change.
  return <BoundAddress key={JSON.stringify([props.context, props.settledEpoch])} {...props} />;
}

function BoundAddress({ context, locale, blocked, prepare, read = readOnlineAddresses }: TripItemAddressProps) {
  const textId = useId();
  const c = copy[locale];
  const [state, setState] = useState<AddressState>({ kind: "loading", context });
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"prepared" | "failed" | null>(null);
  const prepareStarted = useRef(false);
  const mounted = useRef(false);
  const current = useRef<AddressContext | null>(context);
  useEffect(() => {
    mounted.current = true; current.current = context;
    return () => { mounted.current = false; current.current = null; };
  }, [context]);
  useEffect(() => {
    const controller = new AddressReadController();
    void controller.load(context, read, setState);
    return () => controller.invalidate();
  }, [context, read, refresh]);
  const value = state.kind === "ready" && sameAddressContext(state.context, context) ? state.value : null;
  const manual = value?.manual.kind === "provided" ? value.manual.address.text : null;
  const editable = value !== null && value.manual.kind !== "unsupported" && !blocked && !busy && notice !== "failed" && notice !== "prepared";
  async function submit(text: string | null) {
    if (!editable || prepareStarted.current) return;
    prepareStarted.current = true;
    setBusy(true);
    try {
      const result = await prepareAddress(context, () => current.current, text, prepare);
      if (!mounted.current || result === "stale") return;
      setEditing(false); setNotice("prepared");
    } catch { if (mounted.current) setNotice("failed"); }
    finally { if (mounted.current) setBusy(false); }
  }
  function review(event: FormEvent) { event.preventDefault(); if (isUserAddressText(draft)) void submit(draft); }
  return <section className={styles.panel} aria-label={c.title}>
    <h3>{c.title} · v{context.tripVersion}</h3>
    {value ? <AddressFacts value={value} locale={locale} /> : <p role="status">{state.kind === "loading" ? c.loading : c.unavailable}</p>}
    <div role="status">{notice ? c[notice] : blocked ? c.blocked : null}</div>
    {!value || value.referencesUnavailable || value.manual.kind === "unsupported" ? <button type="button" disabled={busy || state.kind === "loading"} onClick={() => setRefresh(n => n + 1)}>{c.retry}</button> : null}
    {editing ? <form onSubmit={review} className={styles.editor}>
      <label htmlFor={textId}>{c.input}</label><textarea id={textId} value={draft} disabled={!editable} onChange={event => setDraft(event.target.value)} aria-describedby={`${textId}-limits`} />
      <p id={`${textId}-limits`}>{c.limits}</p>
      {!isUserAddressText(draft) ? <p>{c.invalid}</p> : null}
      <dl><dt>{c.before}</dt><dd className={styles.text}>{manual ?? c.missing}</dd><dt>{c.after}</dt><dd className={styles.text}>{draft}</dd></dl>
      <div className={styles.actions}><button type="submit" disabled={!editable || !isUserAddressText(draft) || draft === manual}>{c.review}</button><button type="button" disabled={busy} onClick={() => { setEditing(false); setDraft(""); }}>{c.cancel}</button></div>
    </form> : <button type="button" disabled={!editable} onClick={() => { setDraft(manual ?? ""); setEditing(true); }}>{c.edit}</button>}
    {editing && manual !== null ? <button type="button" disabled={!editable} onClick={() => void submit(null)}>{c.clear}</button> : null}
  </section>;
}

export function AddressFacts({ value, locale }: { value: AddressRead; locale: "zh" | "en" }) {
  const c = copy[locale];
  return <div>
    {value.references.map(reference => <div key={reference.supportId} className={styles.fact}>
      <strong>{c.source}</strong><p>{reference.chineseText === "contains_chinese_text" ? c.chinese : reference.chineseText === "not_chinese" ? c.other : c.unknown}</p>
      <p className={styles.text}>{reference.claim.value.lines.join("\n")}</p><ul>{reference.sourceRefs.map(source => <li key={source.sourceRevisionId}>{source.revisionLabel}</li>)}</ul><p>{c.observation}</p>
    </div>)}
    {value.referencesUnavailable ? <p>{c.source}: {c.unavailable}</p> : value.references.length === 0 ? <p>{c.source}: {c.missing}</p> : null}
    <div className={styles.fact}><strong>{c.manual}</strong><p className={styles.text}>{value.manual.kind === "provided" ? value.manual.address.text : value.manual.kind === "missing" ? c.missing : c.unavailable}</p></div>
  </div>;
}
