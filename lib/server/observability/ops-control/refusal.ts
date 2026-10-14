/** Additional operational denial only. This cannot grant actor, source or dispatch authority. */
export const OPS_REFUSAL_CODES=['OPS_CONTROL_DISABLED','OPS_SCOPE_UNAVAILABLE'] as const;
export type OpsRefusalCode=typeof OPS_REFUSAL_CODES[number];
export function opsRefusalCode(v:unknown):OpsRefusalCode|null{
 const value=v instanceof Error?v.message:v;
 return value==='OPS_CONTROL_DISABLED'||value==='OPS_SCOPE_UNAVAILABLE'?value:null;
}
/** Only the two exact new authorization/budget refusal shapes are admitted. */
export function decodeOpsRefusal(v:unknown):OpsRefusalCode|null{
 if(!v||typeof v!=='object'||Array.isArray(v))return null;const row=v as Record<string,unknown>;
 if(Object.keys(row).length!==2||!Object.hasOwn(row,'kind')||!Object.hasOwn(row,'code')||(row.kind!=='blocked'&&row.kind!=='disabled'))return null;
 return opsRefusalCode(row.code);
}
export class OpsControlRefusal extends Error{
 readonly code:OpsRefusalCode;
 constructor(code:OpsRefusalCode){super(code);this.code=code;}
}
export function opsRefusalCopy(locale:string):string{
 return locale==='zh'?'此能力暂时停用，或当前城市范围无法核实。请打开已有行程或已保存成果，按原确认流程手工调整；不会自动重发已发送请求。'
 :'This capability is paused or the current city scope cannot be qualified. Open an existing Trip or saved result and edit manually through its original confirmation flow. Sent requests will not be retried automatically.';
}
export type OpsPause=Readonly<{kind:'ops_paused';code:OpsRefusalCode;accounting:'pending'|'not_dispatched'}>;
export function decodeOpsPause(v:unknown):OpsPause|null{
 if(!v||typeof v!=='object'||Array.isArray(v))return null;const row=v as Record<string,unknown>;
 if(Object.keys(row).length!==3||row.kind!=='ops_paused'||(row.accounting!=='pending'&&row.accounting!=='not_dispatched'))return null;
 const code=opsRefusalCode(row.code);return code?{kind:'ops_paused',code,accounting:row.accounting}:null;
}
