from pathlib import Path
r=Path('artifacts/AGENT-005/canonical-place-sql-20261015');out=r/'after'
for n in ['profile_data_private.schema_v1','result_data_private.schema_supported_v1','turn_data_private.schema_supported_v1','conversation_data_private.schema_supported_v1']:
 s=(r/'before'/f'{n}.sql').read_text()
 a=s.replace('and not a.attisdropped',"and not a.attisdropped and not(a.attrelid='turn_private.grounded_turns'::regclass and a.attname='selected_place_request')")
 a=a.replace('and not attisdropped',"and not attisdropped and not(attrelid='turn_private.grounded_turns'::regclass and attname='selected_place_request')")
 # Normalize only the separately checked added constraint in the fixed old-schema digest.
 a=a.replace('where k.conrelid=c.oid)',"where k.conrelid=c.oid and not(k.conrelid='turn_private.grounded_turns'::regclass and k.conname='grounded_selected_place_request_shape'))")
 a=a.replace('where k.conrelid=r.name::regclass)',"where k.conrelid=r.name::regclass and not(k.conrelid='turn_private.grounded_turns'::regclass and k.conname='grounded_selected_place_request_shape'))")
 if 'LANGUAGE sql' in s:a=a.replace(' select (',' select place_actions_private.ask_schema_v1() and (',1)
 else:a=a.replace('begin\n',"begin\n if not place_actions_private.ask_schema_v1() then return false;end if;\n",1)
 assert a!=s;npath=out/f'{n}.sql';npath.write_text(a+';\n')
