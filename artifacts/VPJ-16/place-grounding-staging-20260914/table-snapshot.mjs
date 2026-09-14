const schemas = ['public','private','auth','supabase_migrations','identity_private','turn_private','knowledge_review_private'];
const lit = s => "'"+s.replaceAll("'","''")+"'";
export function tableSnapshotSQL(previous = null, migrationCutoff = null) {
 if(migrationCutoff!==null && !/^[0-9]{14}$/.test(migrationCutoff))throw new Error("Invalid history cutoff");
 const relations = previous ? `select * from jsonb_to_recordset(${lit(JSON.stringify(previous))}::jsonb) as p(schema text,table_name text,columns jsonb)` :
 `select n.nspname as schema,c.relname as table_name,(select jsonb_agg(a.attname order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in (${schemas.map(lit).join(',')}) and c.relkind in ('r','p')`;
 return `set role postgres; set time zone 'UTC'; begin isolation level repeatable read read only;
 with relations as (${relations}), measured as (
 select schema,table_name,columns,query_to_xml(format(
 'select count(*) as row_count, encode(sha256(convert_to(coalesce(jsonb_agg(row_value order by row_value::text collate "C"), ''[]''::jsonb)::text,''UTF8'')),''hex'') as digest from (select (select jsonb_object_agg(k,to_jsonb(t)->k) from jsonb_array_elements_text(%L::jsonb) as keys(k)) as row_value from %I.%I t %s) projected',columns::text,schema,table_name,case when schema='supabase_migrations' and table_name='schema_migrations' and ${migrationCutoff ? "true" : "false"} then ${lit("where version <= "+lit(migrationCutoff??""))} else '' end),true,false,'') as m from relations)
 select coalesce(jsonb_agg(jsonb_build_object('schema',schema,'table_name',table_name,'columns',columns,'missingColumns',(select count(*) from jsonb_array_elements_text(columns) as expected(k) where not exists(select 1 from pg_attribute att join pg_class rel on rel.oid=att.attrelid join pg_namespace ns on ns.oid=rel.relnamespace where ns.nspname=measured.schema and rel.relname=measured.table_name and att.attname=expected.k and att.attnum>0 and not att.attisdropped)),'count',((xpath('/table/row/row_count/text()',m))[1]::text)::bigint,'digest',(xpath('/table/row/digest/text()',m))[1]::text) order by schema,table_name),'[]'::jsonb) from measured; rollback;`;
}
export function validateSnapshot(rows) {
 if (!Array.isArray(rows) || rows.length < 4 || rows.some(r=>!schemas.includes(r.schema)||typeof r.table_name!=='string'||!Array.isArray(r.columns)||r.missingColumns!==0||!Number.isSafeInteger(r.count)||r.count<0||!/^[0-9a-f]{64}$/.test(r.digest))) throw new Error('Invalid aggregate table snapshot');
 return rows;
}
