'use client';
import Link from 'next/link';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {CONTROL_SCHEMA,mutationId,uuid,type ControlInput,type ControlScope} from '@/lib/server/observability/ops-control/contract';
import {ControlController,emptyControlView,type ControlView} from './controller';
import styles from './workspace.module.css';
const copy={
 zh:{title:'能力停用与恢复',boundary:'仅限授权运营。停用阻止新的派发；已授权或发送中的请求可能继续，未知费用保持待核。恢复不会重试已发送请求，不改变已有行程。',load:'读取当前控制',stop:'停用',resume:'明确恢复',enabled:'允许重新授权',disabled:'已停用',revision:'版本',budget:'预算熔断恢复',scope:'预算 Scope ID',read:'读取预算资格',recover:'恢复预算',budgetBoundary:'预算恢复与能力恢复分别执行。只有费用已对账、原限额和供应商资格仍满足时才可恢复；不会重置费用或提高额度。',pending:'操作结果未知。请读取原操作回执；此期间不发送新变更。',receipt:'读取原回执',login:'登录或切换账号',ledger:'预算观察',empty:'读取当前状态后选择具体范围。',unavailable:'当前不可用，请核对登录与运营资格。',conflict:'版本或操作冲突，请重新读取。',unknown:'操作回执待核。',applied:'已验证原操作回执。请重新读取当前状态后继续。',session_changed:'会话已变化，已清除旧状态。请重新读取。',capability:'能力',provider:'供应商',city:'城市',fence:'恢复资格尚未就绪，当前不能提交控制变更。',eligible:'可恢复',unresolved:'待核费用未完成',exposure:'已用及保留金额（微单位）'},
 en:{title:'Capability stop and recovery',boundary:'Authorized Ops only. Stop blocks new dispatches; already authorized or sent requests may continue. Unknown costs remain pending. Recovery never retries sent requests or changes existing Trips.',load:'Read current controls',stop:'Stop',resume:'Explicitly resume',enabled:'Allows fresh authorization',disabled:'Disabled',revision:'Revision',budget:'Budget circuit recovery',scope:'Budget Scope ID',read:'Read budget eligibility',recover:'Recover budget',budgetBoundary:'Budget and capability recovery are separate. Recovery requires reconciled costs within original limits and current provider eligibility. Costs and limits are preserved.',pending:'Operation acknowledgment is unknown. Read its original receipt before sending another change.',receipt:'Read original receipt',login:'Sign in or switch account',ledger:'Budget observation',empty:'Read current state, then select a specific scope.',unavailable:'Unavailable. Check sign-in and Ops access.',conflict:'Version or operation conflict. Read current state again.',unknown:'Operation receipt is pending.',applied:'Original operation receipt verified. Read current state before continuing.',session_changed:'Session changed; previous state was cleared. Read again.',capability:'Capability',provider:'Provider',city:'City',fence:'Recovery qualification is unavailable; control changes are blocked.',eligible:'Eligible',unresolved:'Unresolved costs remain',exposure:'Used and held amount (micros)'}
} as const;
const scopeLabels={zh:{text:'文字回答',planning_comparison_v1:'区域与交通比较',planning_intake_comparison_v2:'当前需求规划比较',scoped_trip_edit_v1:'已确认范围内的行程编辑',shanghai:'上海',beijing:'北京',guangzhou:'广州',chongqing:'重庆',qwen:'Qwen',glm:'GLM',deepseek:'DeepSeek',amap:'高德地图'},en:{text:'Text answers',planning_comparison_v1:'Area and transport comparison',planning_intake_comparison_v2:'Current intake planning comparison',scoped_trip_edit_v1:'Scoped Trip editing',shanghai:'Shanghai',beijing:'Beijing',guangzhou:'Guangzhou',chongqing:'Chongqing',qwen:'Qwen',glm:'GLM',deepseek:'DeepSeek',amap:'AMap'}} as const;
const eligibilityLabels={zh:{eligible:'可恢复',not_stopped:'预算尚未停用',unresolved:'待核费用未完成',expired:'预算已过期',exhausted:'原预算额度已耗尽',provider_unavailable:'供应商资格不可用',retired:'预算范围已退出',recovery_unavailable:'恢复资格不可用'},en:{eligible:'Eligible',not_stopped:'Budget is not stopped',unresolved:'Unresolved costs remain',expired:'Budget expired',exhausted:'Original budget exhausted',provider_unavailable:'Provider eligibility unavailable',retired:'Budget scope retired',recovery_unavailable:'Recovery qualification unavailable'}} as const;
export function OpsControlWorkspace(){
 const [locale,setLocale]=useState<'zh'|'en'>('zh');const [view,setView]=useState<ControlView>(emptyControlView);const [invalid,setInvalid]=useState(false);
 const controller=useRef<ControlController|null>(null);const c=copy[locale];
 useEffect(()=>{
  const instance=new ControlController(async(input,signal)=>{
   const response=await fetch('/api/ops/controls',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify(input),signal});
   return {status:response.status,body:await response.json() as unknown};
  },setView);controller.current=instance;
  const clear=()=>{if(document.visibilityState==='hidden')instance.invalidate();};
  window.addEventListener('pagehide',clear);document.addEventListener('visibilitychange',clear);
  return ()=>{window.removeEventListener('pagehide',clear);document.removeEventListener('visibilitychange',clear);instance.invalidate();controller.current=null;};
 },[]);
 function execute(input:ControlInput){setInvalid(false);void controller.current?.execute(input);}
 function change(scope:ControlScope,state:'disabled'|'enabled'){
  if(!view.workspace)return;execute({schemaVersion:CONTROL_SCHEMA,action:'set',operationId:crypto.randomUUID(),expectedRevision:view.workspace.revision,scope,state});
 }
 function readBudget(event:FormEvent<HTMLFormElement>){event.preventDefault();const id=String(new FormData(event.currentTarget).get('scopeId')??'').trim();if(!uuid(id)){setInvalid(true);return;}execute({schemaVersion:CONTROL_SCHEMA,action:'budget_read',scopeId:id});}
 const blocked=view.busy||Boolean(view.pending);const pendingId=view.pending&&mutationId(view.pending);
 return <main className={styles.workspace} lang={locale==='zh'?'zh-CN':'en'}>
  <header className={styles.header}><div><p>VisePanda · Ops</p><h1>{c.title}</h1></div><label>Language / 语言<select value={locale} onChange={e=>setLocale(e.target.value as 'zh'|'en')}><option value="zh">中文</option><option value="en">English</option></select></label></header>
  <p>{c.boundary}</p><nav className={styles.actions}><Link href="/auth/sign-in?returnTo=/ops/controls" onClick={()=>controller.current?.invalidate()}>{c.login}</Link><Link href="/ops/budget">{c.ledger}</Link></nav>
  <p role="status">{invalid?(locale==='zh'?'Scope ID 格式无效。':'Invalid Scope ID.'):c[view.message]}</p>
  {pendingId?<section className={styles.panel}><p>{c.pending}</p><p className={styles.receipt}>{pendingId}</p><div className={styles.actions}><button disabled={view.busy} onClick={()=>void controller.current?.readPending()}>{c.receipt}</button></div></section>:null}
  {view.receipt?<section className={styles.panel}><h2>{c.applied}</h2><p className={styles.receipt}>{view.receipt.operationId} · {c.revision} {view.receipt.revision} · {view.receipt.appliedAt}</p><p>{view.receipt.action==='set'?`${c[view.receipt.scope.kind]}: ${scopeLabels[locale][view.receipt.scope.key]} · ${c[view.receipt.state]}`:c.budget}</p></section>:null}
  <section className={styles.panel}><div className={styles.actions}><button disabled={view.busy} onClick={()=>execute({schemaVersion:CONTROL_SCHEMA,action:'workspace'})}>{c.load}</button></div>
   {view.workspace?<><p>{c.revision} {view.workspace.revision} · {view.workspace.observedAt}</p>{!view.workspace.recoveryReady?<p>{c.fence}</p>:null}<div className={styles.rows}>{view.workspace.controls.map(entry=><div className={styles.row} key={entry.scope.kind+':'+entry.scope.key}><div><p>{c[entry.scope.kind]}: {scopeLabels[locale][entry.scope.key]}</p><p>{c[entry.state]} · {c.revision} {entry.revision}</p></div><div className={styles.actions}><button disabled={blocked||!view.workspace?.recoveryReady||entry.state==='disabled'} onClick={()=>change(entry.scope,'disabled')}>{c.stop}</button><button disabled={blocked||!view.workspace?.recoveryReady||entry.state==='enabled'} onClick={()=>change(entry.scope,'enabled')}>{c.resume}</button></div></div>)}</div></>:null}
  </section>
  <section className={styles.panel}><h2>{c.budget}</h2><p>{c.budgetBoundary}</p><form onSubmit={readBudget}><label>{c.scope}<input name="scopeId" required autoComplete="off" spellCheck={false}/></label><div className={styles.actions}><button disabled={view.busy} type="submit">{c.read}</button></div></form>
   {view.budget?<><p>{c.revision} {view.budget.revision} · {eligibilityLabels[locale][view.budget.eligibility]}</p><p>{c.exposure}: {view.budget.exposureMicros}</p><div className={styles.actions}><button disabled={blocked||view.budget.eligibility!=='eligible'} onClick={()=>{if(view.budget)execute({schemaVersion:CONTROL_SCHEMA,action:'budget_resume',operationId:crypto.randomUUID(),scopeId:view.budget.scopeId,expectedRevision:view.budget.revision});}}>{c.recover}</button></div></>:null}
  </section>
 </main>;
}
