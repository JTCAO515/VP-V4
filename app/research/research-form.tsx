"use client";
import { useRef, useState, type FormEvent } from "react";
import { INTAKE_POLICY } from "@/lib/server/intake/contract";
import styles from "./research.module.css";
const copy = {
  en: {
    label: "HELP SHAPE VISEPANDA", title: "A better trip starts with your experience.",
    intro: "Join a founder-assisted research session about planning a trip to China. We may invite you to discuss your experience and try a clearly labelled prototype. Applying is free and does not guarantee a place.",
    scope: "This is research, not a downloadable complete app, a booking service or 24-hour support. Prototype replies may be preset fixtures. We will say which features are live before a session.",
    privacyTitle: "Your email, your choice", privacy: "We collect only your email, language, consent choices and application events. We use your email to contact you about this research. Marketing is optional and separate; no AI provider receives this form. Only designated research operators may access applications. Your email stays until you withdraw or the research closes. Withdrawal clears it from the active application and stops research and marketing contact; restricted backups expire under the hosting backup schedule, not instantly. Do not submit passwords, verification codes, payment details or travel documents.",
    email: "Email", research: "I agree to be contacted for this research and to the data use described above.", marketing: "Optional: email me VisePanda product news. I can join research without this.", submit: "Apply for research", pending: "Saving…", receipt: "Application received", receiptBody: "Your request is recorded. If you already applied, the original application and its exit code remain unchanged. You have not been enrolled and no email has been sent. Save this private exit code before leaving; it is needed to withdraw from another browser. Do not share it.", code: "Private exit code", withdrawTitle: "Leave the research", withdrawBody: "Use your saved exit code to revoke research and marketing consent and clear your email. Lost your code? Contact the research organizer through your existing conversation. This affects this research form only, not the separate Early Access questionnaire.", withdraw: "Withdraw and clear my email", withdrawn: "Exit request processed. Any application matching this code is withdrawn and its email cleared. An unknown code does not identify or change anyone else’s application.", unavailable: "We could not save this request. No success is confirmed. Please retry later using the same code.", invalid: "Check the email, required consent and exit code, then try again.", conflict: "This request could not be accepted. If you applied before, use your original exit code. Do not repeatedly submit.", rate: "Applications are temporarily limited. Try again in an hour. Withdrawal remains available.", save: "Save exit code", retry: "A retry uses the same code. Keep your details unchanged until it succeeds.", exitHelp: "64 letters and digits, shown on your application receipt.",
  },
  zh: {
    label: "一起完善 VISEPANDA", title: "让你的经历，帮助下一段旅行。",
    intro: "申请参加由创始团队协助的来华旅行产品研究。我们可能邀请你聊聊旅行规划经历，试用明确标注的原型。申请免费，不保证入选。",
    scope: "这是研究招募，不是完整 App 下载、预订服务或全天客服。原型回复可能是预设演示；每次研究前会说明哪些功能已真实接通。",
    privacyTitle: "你的邮箱，由你决定", privacy: "仅收集邮箱、语言、同意选择与申请事件，邮箱用于本次研究联系。营销可选且独立；本表单不向 AI 供应商发送数据。仅指定研究运营人员可访问申请。邮箱保留至你退出或研究结束。退出后清除活动申请中的邮箱，并停止研究及营销联系；受限备份按托管备份周期到期，不是即时擦除。请勿提交密码、验证码、支付信息或旅行证件。",
    email: "邮箱", research: "我同意接收本次研究联系，并同意上方说明的数据用途。", marketing: "可选：通过邮箱接收 VisePanda 产品消息。不勾选也可以参加研究。", submit: "申请参加研究", pending: "正在保存…", receipt: "申请已收到", receiptBody: "请求已记录。如果你已申请过，原申请和原退出码保持不变。尚未入组，也没有发送邮件。离开前请保存下方私密退出码；换浏览器退出时需要使用，请勿分享。", code: "私密退出码", withdrawTitle: "退出研究", withdrawBody: "使用保存的退出码撤销研究及营销同意，并清除邮箱。遗失退出码时，请通过已有对话联系研究组织者。此操作仅适用于本研究表单，不影响独立的 Early Access 问卷。", withdraw: "退出并清除我的邮箱", withdrawn: "退出请求已处理。与退出码匹配的申请已退出并清除邮箱；未知退出码不会识别或修改其他人的申请。", unavailable: "未能保存本次请求，尚未确认成功。请稍后使用相同退出码重试。", invalid: "请检查邮箱、必选同意及退出码后重试。", conflict: "本次申请未能受理。如果之前申请过，请使用原退出码，不要重复提交。", rate: "申请暂时达到限额，请一小时后重试。退出功能仍可使用。", save: "保存退出码", retry: "重试会使用相同退出码；成功前请保持资料不变。", exitHelp: "申请回执中显示的 64 位字母和数字。",
  },
} as const;
export function ResearchForm({ locale }: { locale: "zh" | "en" }) {
  const c = copy[locale];
  const [busy, setBusy] = useState(false);
  const [received, setReceived] = useState(false);
  const [message, setMessage] = useState("");
  const [exitCode, setExitCode] = useState("");
  const [receiptCode, setReceiptCode] = useState("");
  const token = useRef("");
  const inflight = useRef(false);
  async function send(event: FormEvent<HTMLFormElement>, action: "apply" | "withdraw") {
    event.preventDefault();
    if (inflight.current) return;
    const fields = new FormData(event.currentTarget);
    if (action === "apply" && !token.current) token.current = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
    if (action === "apply") setExitCode(token.current);
    const input = action === "apply" ? { action, email: fields.get("email"), locale, researchConsent: fields.get("research") === "on", marketingConsent: fields.get("marketing") === "on", policyVersion: INTAKE_POLICY, token: token.current, website: fields.get("website") } : { action, token: exitCode.trim() };
    inflight.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/intake", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (response.ok && data.kind === "received" && action === "apply") { setReceived(true); setReceiptCode(token.current); setMessage(c.receipt); }
      else if (response.ok && data.kind === "withdrawn" && action === "withdraw") { if (exitCode.trim() === token.current) { setReceived(false); token.current = ""; setReceiptCode(""); } setExitCode(""); setMessage(c.withdrawn); }
      else setMessage(data.kind === "rate_limited" ? c.rate : ["request_not_accepted", "receipt_conflict"].includes(data.kind) ? c.conflict : data.kind === "invalid_input" ? c.invalid : c.unavailable);
    } catch { setMessage(c.unavailable); }
    finally { inflight.current = false; setBusy(false); }
  }
  function saveCode() {
    const url = URL.createObjectURL(new Blob([`${c.code}\n${receiptCode}\n/research?lang=${locale}\n`], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "visepanda-research-exit-code.txt"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <header className={styles.header}><p className={styles.eyebrow}>{c.label}</p><h1>{c.title}</h1><p>{c.intro}</p><p className={styles.note}>{c.scope}</p></header>
    <section className={styles.card} aria-labelledby="research-privacy"><h2 id="research-privacy">{c.privacyTitle}</h2><p>{c.privacy}</p>
      {!received ? <form onSubmit={event => void send(event, "apply")}>
        <label htmlFor="research-email">{c.email}</label><input id="research-email" name="email" type="email" autoComplete="email" maxLength={254} required disabled={busy} />
        <div className={styles.trap} aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <label className={styles.choice}><input type="checkbox" name="research" required disabled={busy} /><span>{c.research}</span></label>
        <label className={styles.choice}><input type="checkbox" name="marketing" disabled={busy} /><span>{c.marketing}</span></label>
        <button type="submit" disabled={busy}>{busy ? c.pending : c.submit}</button>
      </form> : <div><h3>{c.receipt}</h3><p>{c.receiptBody}</p><p className={styles.code}>{receiptCode}</p><button type="button" onClick={saveCode}>{c.save}</button></div>}
      <p role="status" aria-live="polite" className={styles.status}>{message}</p>
      {!received && exitCode ? <p>{c.retry}</p> : null}
    </section>
    <section className={styles.card} aria-labelledby="research-exit"><h2 id="research-exit">{c.withdrawTitle}</h2><p>{c.withdrawBody}</p>
      <form onSubmit={event => void send(event, "withdraw")}><label htmlFor="exit-code">{c.code}</label><input id="exit-code" value={exitCode} onChange={event => setExitCode(event.target.value)} required pattern="[a-f0-9]{64}" maxLength={64} autoComplete="off" spellCheck={false} aria-describedby="exit-help" disabled={busy} /><small id="exit-help">{c.exitHelp}</small><button type="submit" disabled={busy}>{busy ? c.pending : c.withdraw}</button></form>
    </section>
  </>;
}
