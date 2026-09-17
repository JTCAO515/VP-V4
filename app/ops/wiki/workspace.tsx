"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { WikiRead, WikiPageList } from "@/lib/server/knowledge/wiki/read-model";
import { conflictsByProposal, detectProposalConflicts, type ProposalConflict, type StructuredWikiDraft } from "@/lib/server/knowledge/wiki/proposals";
import styles from "../review/workspace.module.css";

const copy = {
  zh: { heading: "Wiki 草稿", boundary: "生成内容供运营核对，尚未成为已发布事实。声明审核与发布仍使用现有流程。", login: "登录", review: "声明审核", language: "语言", key: "页面标识", lookup: "查看", recent: "最近 50 个页面", refresh: "刷新列表", busy: "读取中…", unavailable: "暂时无法读取，请检查登录与 Ops 权限后重试。", missing: "没有找到页面。", empty: "暂无页面。", current: "当前版本", previous: "上一版本", noPrevious: "没有上一版本，无法比较。", noBody: "此历史版本未保存正文，无法还原或比较。", noRevision: "尚无完成的草稿版本。", gaps: "待核实缺口", sources: "来源与原文位置", absentSource: "来源记录缺失，无法核实", changes: "正文差异", same: "正文未变化", changed: "正文已变化，请对照两个版本", unknownDiff: "正文缺失，差异未知", added: "新增", removed: "移除", jobs: "最近 10 个生成任务", tokens: "记录的 token 数（非账单）", unknown: "未知", metadata: "生成记录", draft: "草稿", validated: "已校验（不代表发布）", rejected: "已拒绝", conflictReason: { objectId: "对象不同", conditions: "条件不同", exclusions: "例外不同" } as Record<ProposalConflict["reason"], string> },
  en: { heading: "Wiki drafts", boundary: "Generated content is for operator review and is not a published fact. Statements use the existing review and publication process.", login: "Sign in", review: "Statement review", language: "Language", key: "Page key", lookup: "View", recent: "Latest 50 pages", refresh: "Refresh list", busy: "Loading…", unavailable: "Unable to read. Check your session and Ops access, then retry.", missing: "Page not found.", empty: "No pages yet.", current: "Current version", previous: "Previous version", noPrevious: "No previous version to compare.", noBody: "This historical revision has no stored body; it cannot be reconstructed or compared.", noRevision: "No completed draft revision yet.", gaps: "Gaps to verify", sources: "Sources and original location", absentSource: "Source record missing; cannot verify", changes: "Body differences", same: "Body unchanged", changed: "Body changed; compare both versions", unknownDiff: "Body missing; differences unknown", added: "Added", removed: "Removed", jobs: "Latest 10 generation jobs", tokens: "Recorded tokens (not an invoice)", unknown: "Unknown", metadata: "Generation record", draft: "Draft", validated: "Validated (not published)", rejected: "Rejected", conflictReason: { objectId: "different object", conditions: "different conditions", exclusions: "different exclusions" } as Record<ProposalConflict["reason"], string> },
};
/** Purely structural, non-semantic conflicts between this revision's OWN structured
 * proposals -- see detectProposalConflicts. Computed client-side from the already-
 * persisted draftContent already present in the read response; adds no new fetch,
 * field or migration. Never resolves/reorders/hides a proposal, only flags it. */
function structuralConflicts(draftContent: unknown): ReturnType<typeof conflictsByProposal> | null {
  if (!draftContent || typeof draftContent !== "object" || !("schemaVersion" in draftContent) || (draftContent as { schemaVersion: unknown }).schemaVersion !== "wiki-draft/2") return null;
  return conflictsByProposal(detectProposalConflicts(draftContent as StructuredWikiDraft));
}

export function OpsWikiWorkspace() {
  const [locale, setLocale] = useState<"zh" | "en">("zh");
  const [pages, setPages] = useState<WikiPageList["pages"]>([]);
  const [result, setResult] = useState<WikiRead | null>(null);
  const [status, setStatus] = useState<"idle" | "busy" | "unavailable" | "missing">("idle");
  const selected = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const c = copy[locale];
  const load = useCallback(async (pageKey: string | null, background = false) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    selected.current = pageKey;
    if (!background) { setResult(null); setPages([]); setStatus("busy"); }
    try {
      const response = await fetch(`/api/ops/wiki${pageKey ? `?pageKey=${encodeURIComponent(pageKey)}` : ""}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
      const body = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) { setResult(null); setPages([]); setStatus(response.status === 404 ? "missing" : "unavailable"); return; }
      if (pageKey) setResult(body.data as WikiRead); else setPages((body.data as WikiPageList).pages);
      setStatus("idle");
    } catch { if (!controller.signal.aborted) { setResult(null); setPages([]); setStatus("unavailable"); } }
  }, []);
  useEffect(() => {
    void load(null);
    const refresh = () => { if (document.visibilityState === "visible") void load(selected.current, true); else { request.current?.abort(); setResult(null); setPages([]); } };
    const interval = setInterval(refresh, 25000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("pageshow", refresh);
    return () => { request.current?.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("pageshow", refresh); };
  }, [load]);
  function lookup(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void load(String(new FormData(event.currentTarget).get("pageKey") ?? "").trim()); }
  const current = result?.revisions[0]; const previous = result?.revisions[1];
  const currentConflicts = current ? structuralConflicts(current.draftContent) : null;
  return <main className={styles.workspace} lang={locale}>
    <header className={styles.header}><h1>{c.heading}</h1><label>{c.language}<select value={locale} onChange={e => setLocale(e.target.value as "zh" | "en")}><option value="zh">中文</option><option value="en">English</option></select></label></header>
    <p className={styles.boundary}>{c.boundary}</p>
    <nav className={styles.actions}><Link href="/auth/sign-in?returnTo=/ops/wiki">{c.login}</Link><Link href="/ops/review">{c.review}</Link><button onClick={() => void load(null)}>{c.refresh}</button></nav>
    <form className={styles.panel} onSubmit={lookup}><label>{c.key}<input name="pageKey" required maxLength={200} /></label><button>{c.lookup}</button></form>
    <p role="status">{status === "idle" ? "" : c[status]}</p>
    {!result && status === "idle" && <section className={styles.panel}><h2>{c.recent}</h2>{pages.length ? pages.map(p => <p key={p.pageKey}><button onClick={() => void load(p.pageKey)}>{p.pageKey} · v{p.version}</button></p>) : <p>{c.empty}</p>}</section>}
    {result && <section className={styles.list}>
      <h2 style={{ overflowWrap: "anywhere" }}>{result.pageKey} · v{result.version}</h2>
      {current?.draftContent && current.validationStatus !== "rejected" && <Link href={`/ops/review?wikiPageKey=${encodeURIComponent(result.pageKey)}&wikiRevisionId=${current.id}&wikiVersion=${current.version}`}>{locale === "zh" ? "根据此版本整理声明" : "Prepare a statement from this version"}</Link>}
      {current?.draftContent && 'schemaVersion' in current.draftContent && current.draftContent.schemaVersion==='wiki-draft/2' && <section className={styles.panel}>
        <h3>{locale==='zh'?'模型声明提案（待核对）':'Model statement proposals (unreviewed)'}</h3>
        {current.draftContent.statementProposals.length===0 && <p>{locale==='zh'?'没有声明提案，请核对来源与缺口。':'No statement proposals; review the sources and gaps.'}</p>}
        {current.draftContent.statementProposals.map((p,i)=><article key={i}><p className={styles.content}>{p.statement.expressions[locale].text}</p>{p.evidence.map((e,n)=><blockquote className={styles.content} key={n}>{e.quote}</blockquote>)}{currentConflicts?.get(i)?.map((conflict,n)=><p key={`conflict-${n}`} role="alert" className={styles.conflict}>{locale==='zh'?`⚠ 与提案 #${conflict.other+1} 冲突（${c.conflictReason[conflict.reason]}），需人工核实，不会自动合并或丢弃任一方。`:`⚠ Conflicts with proposal #${conflict.other+1} (${c.conflictReason[conflict.reason]}); needs manual review, neither is auto-merged or dropped.`}</p>)}{current.validationStatus!=='rejected' && <Link href={`/ops/review?wikiPageKey=${encodeURIComponent(result.pageKey)}&wikiRevisionId=${current.id}&wikiVersion=${current.version}&wikiProposalIndex=${i}`}>{locale==='zh'?'核对并编辑此提案':'Verify and edit this proposal'}</Link>}</article>)}
      </section>}
      <p>{c.changes}: {!previous ? c.noPrevious : !current?.draftContent || !previous.draftContent ? c.unknownDiff : JSON.stringify(current.draftContent) === JSON.stringify(previous.draftContent) ? c.same : c.changed}</p>
      {current?.draftContent && previous?.draftContent && <article className={styles.panel}>
        {current.draftContent.summary !== previous.draftContent.summary && <>
          <p className={styles.content}>{c.removed}: <del>{previous.draftContent.summary}</del></p>
          <p className={styles.content}>{c.added}: <ins>{current.draftContent.summary}</ins></p>
        </>}
        {previous.draftContent.gaps.filter(gap => !current.draftContent!.gaps.includes(gap)).map((gap, n) => <p key={`removed-${n}`}>{c.removed}: <del>{gap}</del></p>)}
        {current.draftContent.gaps.filter(gap => !previous.draftContent!.gaps.includes(gap)).map((gap, n) => <p key={`added-${n}`}>{c.added}: <ins>{gap}</ins></p>)}
      </article>}
      {current?.draftContent && previous?.draftContent && ('schemaVersion' in current.draftContent || 'schemaVersion' in previous.draftContent) && <p>{locale==='zh'?'声明提案请在下方两个版本的详情中逐项对照；摘要和缺口不代表完整提案差异。':'Compare statement proposals in both revision details below; summary and gap changes do not represent all proposal changes.'}</p>}
      {!current && <p>{c.noRevision}</p>}
      {result.revisions.map((revision, i) => <article className={styles.panel} key={revision.id}>
        <h3>{i === 0 ? c.current : c.previous} · v{revision.version} · {c[revision.validationStatus]}</h3>
        <p>{revision.changeNote}</p>
        {revision.draftContent ? <><p className={styles.content}>{revision.draftContent.summary}</p><h4>{c.gaps}</h4><ul>{revision.draftContent.gaps.map((gap, n) => <li key={n}>{gap}</li>)}</ul></> : <p>{c.noBody}</p>}
        {revision.draftContent && 'schemaVersion' in revision.draftContent && (() => { const revisionConflicts = structuralConflicts(revision.draftContent); return <details><summary>{locale==='zh'?'此版本的声明提案':'Statement proposals in this revision'} ({revision.draftContent.statementProposals.length})</summary>{revision.draftContent.statementProposals.map((p,pi)=><section key={pi}><p className={styles.content}>{p.statement.expressions[locale].text}</p><ul>{p.statement.expressions[locale].conditions.map((v,n)=><li key={`c${n}`}>{v}</li>)}{p.statement.expressions[locale].exclusions.map((v,n)=><li key={`e${n}`}>{v}</li>)}</ul>{p.evidence.map((e,n)=><blockquote className={styles.content} key={n}>{e.quote}<p className={styles.meta}>{e.sourceRevisionId} · {e.startOffset}–{e.endOffset}</p></blockquote>)}{revisionConflicts?.get(pi)?.map((conflict,n)=><p key={`conflict-${n}`} role="alert" className={styles.conflict}>{locale==='zh'?`⚠ 与提案 #${conflict.other+1} 冲突（${c.conflictReason[conflict.reason]}）`:`⚠ Conflicts with proposal #${conflict.other+1} (${c.conflictReason[conflict.reason]})`}</p>)}</section>)}</details>; })()}
        <details><summary>{c.sources} ({revision.sources.length})</summary>{revision.sources.map((source, n) => <section key={`${source.id}:${n}`} className={styles.content}>
          <p>{source.id}</p>{source.missing ? <p>{c.absentSource}</p> : <><p>{source.declaration?.publisher} · {source.declaration?.revisionLabel}</p><p>{source.declaration?.uri}</p><p>{source.declaration?.locator}</p><blockquote>{source.declaration?.snippet}</blockquote></>}
        </section>)}</details>
        <details><summary>{c.metadata}</summary><p className={styles.content}>{revision.jobId}<br />{revision.generatedAt}<br />{revision.promptVersion}<br />{revision.configDigest}<br />{revision.inputDigest}</p></details>
      </article>)}
      <article className={styles.panel}><h3>{c.jobs}</h3>{result.jobs.map(job => <p key={job.id} className={styles.content}>{job.id} · {job.status} {job.errorCode}<br />{c.tokens}: {job.costUnknown ? c.unknown : job.costTokens}</p>)}</article>
    </section>}
  </main>;
}
