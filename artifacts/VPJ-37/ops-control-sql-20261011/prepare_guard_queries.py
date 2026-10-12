"""Pure catalog queries extracted from exact verified original metadata guards."""
import json
import re
from pathlib import Path
OUT=Path(__file__).resolve().parent
BASE={x['signature']:x for x in json.loads((OUT/'catalog-before.json').read_text())}
queries={};locations=[]

def end_call(s,start):
    i=s.index('(',start);depth=0;quote=False
    while i<len(s):
        c=s[i]
        if c=="'":
            if quote and s[i:i+2]=="''":i+=2;continue
            quote=not quote
        elif not quote:
            if c=='(':depth+=1
            elif c==')':
                depth-=1
                if depth==0:return i+1
        i+=1
    raise ValueError('Unbalanced original guard expression')

for signature in ['profile_data_private.schema_v1()','conversation_data_private.schema_supported_v1()',
                  'result_data_private.schema_supported_v1()','turn_data_private.schema_supported_v1()']:
    source=BASE[signature]['prosrc']
    for m in re.finditer(r'(?:profile_data_private|result_data_private)\.digest_v1\(\(select coalesce\(jsonb_agg\(jsonb_build_object\(\x27relation\x27',source):
        end=end_call(source,m.start());expr=source[m.start():end]
        tail=re.match(r"\s*(?:<>|=)\s*'([a-f0-9]{64})'",source[end:])
        assert tail,'Exact original hash literal required'
        key='global-'+signature
        queries[key]='set search_path=\x27\x27;select '+expr+';'
        locations.append({'signature':signature,'key':key,'oldHash':tail[1]})

source=BASE['profile_data_private.schema_v1()']['prosrc']
match=re.search(r'(select coalesce\(jsonb_agg\(jsonb_build_array\(tgrelid.*?);\s*if actual is distinct from',source,re.S)
assert match
query=match[1].replace(' into actual ',' ')
initial=re.search(r'names text\[\]:=(array\[.*?\]);',source,re.S)
assert initial
query=re.sub(r'\bnames\b',"("+initial[1]+"::text[]||(select coalesce(array_agg(relation_name),'{}') from profile_data_private.sources_v1()))",query)
queries['profile-triggers']="set search_path='';"+query+';'
source=BASE['conversation_data_private.schema_supported_v1()']['prosrc']
match=re.search(r'(select coalesce\(jsonb_agg\(jsonb_build_object\(\x27from\x27.*?);\s*return foreign_n',source,re.S)
assert match
queries['conversation-fk']="set search_path='';"+match[1].replace(' into foreign_n ',' ')+';'
(OUT/'guard-queries.json').write_text(json.dumps(queries,indent=2)+'\n')
(OUT/'guard-query-locations.json').write_text(json.dumps(locations,indent=2)+'\n')
print('Prepared '+str(len(queries))+' exact pure-catalog guard queries')
