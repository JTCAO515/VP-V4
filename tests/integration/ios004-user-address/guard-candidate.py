# Produces a review candidate only; new seed is not modified by this script.
import json,re,hashlib,difflib
from pathlib import Path
root=Path('artifacts/IOS-004/address-authority-20261016')
original={r['signature']:r for r in json.loads((root/'original-functions.json').read_text())}
authored={r['signature']:r for r in json.loads((root/'authored-functions.json').read_text())}
guard=next(r for r in json.loads((root/'guard-candidates-before.json').read_text()) if r['signature']=='turn_private.trip_service_task_runtime_v1()')
accepted=Path('supabase/migrations/20261015083120_agent005_canonical_place_ask.sql').read_text()
start=accepted.index('CREATE OR REPLACE FUNCTION turn_private.trip_service_task_runtime_v1()')
a=accepted.index('AS $function$',start)+len('AS $function$');b=accepted.index('$function$',a)
assert accepted[a:b]==guard['prosrc'],'guard is not the accepted source'
sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
before=guard['definition'];after=before
changes=[]
for sig in ['trip_content_snapshot(uuid,text)','apply_trip_content_patch(jsonb,jsonb)','record_scoped_trip_edit_destination_v1(jsonb,jsonb,text,text,text,text)']:
 pattern=r'"public\.'+re.escape(sig)+r'":'
 m=re.search(pattern,guard['prosrc']);assert m,sig
 pin=json.JSONDecoder().raw_decode(guard['prosrc'][m.end():])[0];old=original[sig];new=authored[sig]
 assert sha(old['prosrc'])==pin['source'] and sha(old['definition'])==pin['definition'],'before drift'
 assert old['acl']==new['acl'],'ACL drift'
 for key,col in [('source','prosrc'),('definition','definition')]:
  old_hash=pin[key];new_hash=sha(new[col]);assert after.count(old_hash)==1
  after=after.replace(old_hash,new_hash);changes.append({'signature':'public.'+sig,'field':key,'before':old_hash,'after':new_hash})
(root/'runtime-guard.before.sql').write_text(before)
(root/'runtime-guard.after.sql').write_text(after)
(root/'runtime-guard.patch').write_text(''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='runtime-guard.before.sql',tofile='runtime-guard.after.sql')))
(root/'runtime-guard.changes.json').write_text(json.dumps({'guard':'turn_private.trip_service_task_runtime_v1()','beforeSourceSHA256':sha(guard['prosrc']),'changes':changes},indent=2)+'\n')
print(json.dumps(changes,indent=2))
