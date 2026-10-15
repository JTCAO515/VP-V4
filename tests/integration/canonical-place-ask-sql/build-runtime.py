from pathlib import Path
import json,re
r=Path('artifacts/AGENT-005/canonical-place-sql-20261015');pins=json.loads((r/'function-pins.json').read_text());private=json.loads((r/'private-pins.json').read_text());s=(r/'before/turn_data_private.runtime_supported_v1.sql').read_text();m=re.search("jsonb_each\\('([^']+)'::jsonb\\)",s);old=json.loads(m[1]);new=old.copy()
for p in pins:
 if p['signature'] in old:new[p['signature']]=p['afterMd5']
for p in private:new[p['signature']]=p['md5']
s=s[:m.start(1)]+json.dumps(new,separators=(',',':'))+s[m.end(1):]
checks="\n -- Exact newly authored private proof helpers: no ordinary or service grants.\n"
checks+=" for r in select unnest(array["+','.join("'"+p['signature']+"'" for p in private)+"]) key loop\n select * into p from pg_proc where oid=to_regprocedure(r.key);\n if p.oid is null or pg_get_userbyid(p.proowner)<>'postgres' or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE') then return false;end if;\n end loop;\n"
s=s.replace(' -- Managed Auth',checks+' -- Managed Auth');(r/'after/turn_data_private.runtime_supported_v1.sql').write_text(s+';\n')
