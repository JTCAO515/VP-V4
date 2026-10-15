from pathlib import Path
import json
r=Path('artifacts/AGENT-005/canonical-place-sql-20261015');items=json.load(open(r/'source-chain.json'));code=[]
for f in items:
 name=f['signature'].split('(')[0];s=f['definition'];(r/'before'/f'{name}.sql').write_text(s)
 if 'knowledge_read_v1' in name:
  s=s.replace('public.knowledge_read_v1(p_input jsonb)','place_actions_private.ask_knowledge_scope_v1(p_input jsonb)')
  start=s.index('declare u uuid:=auth.uid();');end=s.index(' if not knowledge_review_private.closed_object',start)
  s=s[:start]+"declare instant timestamptz; result jsonb;\nbegin\n"+s[end:]
  sig='place_actions_private.ask_knowledge_scope_v1(jsonb)'
 elif name.endswith('.claim_basis'):
  s=s.replace('trip_support_private.claim_basis(', 'place_actions_private.ask_claim_basis_v1(').replace('public.knowledge_read_v1(', 'place_actions_private.ask_knowledge_scope_v1(')
  sig='place_actions_private.ask_claim_basis_v1(uuid,integer,text,text,text,text)'
 elif name.endswith('.mapping_basis'):
  s=s.replace('trip_support_private.mapping_basis(', 'place_actions_private.ask_mapping_basis_v1(').replace('trip_support_private.claim_basis(', 'place_actions_private.ask_claim_basis_v1(')
  sig='place_actions_private.ask_mapping_basis_v1(uuid,boolean)'
 else:
  s=s.replace('place_actions_private.sources_v1(', 'place_actions_private.ask_sources_v1(').replace('trip_support_private.mapping_basis(', 'place_actions_private.ask_mapping_basis_v1(')
  sig='place_actions_private.ask_sources_v1(uuid,text)'
 code.append(s+';\nrevoke all on function '+sig+' from public,anon,authenticated,service_role;\n')
(r/'source-chain.sql').write_text('-- Exact post-auth source qualification bodies from original reader/helpers.\n-- No new resolver and no identity substitution. Only called after original Root locks.\n'+'\n'.join(code))
p=r/'private.sql';s=p.read_text().replace('place_actions_private.sources_v1(', 'place_actions_private.ask_sources_v1(');p.write_text(s)
