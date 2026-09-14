import styles from "./workspace.module.css";
import type { SourceDeclaration } from "@/lib/server/knowledge/review/source-assertion";
import { knowledgeEditorCopy, opsSourceCopy, type Locale } from "@/lib/i18n";
import { KNOWLEDGE_CITIES, KNOWLEDGE_SCENES, type KnowledgeStatement, type TravelAssertion } from "@/lib/server/knowledge/publication/statement";
export function StatementFields({locale,disabled,wikiSources}:{locale:Locale;disabled:boolean;wikiSources?:readonly {id:string;declaration:SourceDeclaration}[]}){
 const c=knowledgeEditorCopy[locale],s=opsSourceCopy[locale];
 return <fieldset disabled={disabled}><legend>{c.mode}</legend>
  {wikiSources ? <section>
    <p>{locale === 'zh' ? '选择 1–3 份原始来源；来源内容按已有版本保留。' : 'Select 1–3 original sources. Existing source versions are preserved.'}</p>
    {wikiSources.map((source,i)=><label className={styles.content} key={source.id}><input className={styles.modeCheckbox} type="checkbox" name="wikiSource" value={source.id} defaultChecked={i<3}/>{source.declaration.publisher} · {source.declaration.sourceKey} · {source.declaration.revisionLabel}<span>{source.declaration.locator}</span><blockquote>{source.declaration.snippet}</blockquote></label>)}
  </section> : <>
  {([['sourceKey',128],['revisionLabel',120],['publisher',160],['uri',1000],['locator',240]] as const).map(([name,max])=><label key={name}>{s[name]}<input name={name} required maxLength={max}/></label>)}
  <label>{s.snippet}<textarea name="snippet" required maxLength={2000} rows={3}/></label><label>{s.usageDeclaration}<textarea name="usageDeclaration" required maxLength={500} rows={2}/></label>
  </>}
  <label>{s.subjectId}<input name="subjectId" required maxLength={128}/></label><label>{c.predicate}<select name="predicate">{['offers_procedure','accepts_method','requires_document','requires_action','connects_to','provides_contact','permits_admission'].map(p=><option key={p}>{p}</option>)}</select></label><label>{c.object}<input name="objectId" required maxLength={128}/></label>
  <label>{c.conditions}<textarea name="conditions" rows={2} maxLength={1547}/></label><label>{c.exclusions}<textarea name="exclusions" rows={2} maxLength={1547}/></label>
  <label>{c.cities}<select name="cities" multiple required defaultValue={['shanghai']}>{KNOWLEDGE_CITIES.map(v=><option key={v}>{v}</option>)}</select></label><label>{c.scene}<select name="scene">{KNOWLEDGE_SCENES.map(v=><option key={v}>{v}</option>)}</select></label>
  {([['conditionsZh',c.conditions+' · '+s.zh],['conditionsEn',c.conditions+' · '+s.en],['exclusionsZh',c.exclusions+' · '+s.zh],['exclusionsEn',c.exclusions+' · '+s.en]] as const).map(([name,label])=><label key={name}>{label}<textarea name={name} maxLength={2891} rows={2}/></label>)}
  <label>{s.zh}<textarea name="expressionZh" required maxLength={1000} rows={3}/></label><label>{s.en}<textarea name="expressionEn" required maxLength={1000} rows={3}/></label>
 </fieldset>;
}
export function statementFields(values:FormData):KnowledgeStatement{
 const get=(name:string)=>String(values.get(name)??'');const ids=(name:string)=>get(name).split('\n').map(x=>x.trim()).filter(Boolean);
 return {schemaVersion:'knowledge-statement/1',assertion:{subjectId:get('subjectId'),predicate:get('predicate') as TravelAssertion['predicate'],objectId:get('objectId'),conditions:ids('conditions'),exclusions:ids('exclusions')},scope:{cities:values.getAll('cities') as KnowledgeStatement['scope']['cities'],scene:get('scene') as KnowledgeStatement['scope']['scene'],audience:'international_independent_traveler'},expressions:{zh:{text:get('expressionZh'),conditions:ids('conditionsZh'),exclusions:ids('exclusionsZh')},en:{text:get('expressionEn'),conditions:ids('conditionsEn'),exclusions:ids('exclusionsEn')}},sources:[{sourceKey:get('sourceKey'),revisionLabel:get('revisionLabel'),publisher:get('publisher'),uri:get('uri'),locator:get('locator'),snippet:get('snippet'),usageDeclaration:get('usageDeclaration')}]};
}
