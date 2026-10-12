"""Static SQL source inventory. Does not impersonate a PostgreSQL catalog replay."""
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
names = {
    'public.start_text_turn', 'public.submit_service_task_turn', 'public.submit_grounded_turn',
    'public.submit_planning_comparison_v1', 'public.submit_planning_comparison_v2',
    'public.read_text_work', 'public.read_grounded_work', 'public.read_planning_work_v1',
    'public.authorize_text_dispatch', 'public.authorize_text_task_dispatch',
    'public.authorize_grounded_dispatch', 'public.authorize_planning_read_v1',
    'public.authorize_planning_dispatch_v1', 'public.authorize_planning_intake_external_read_v1',
    'public.authorize_planning_intake_model_v1', 'public.planning_intake_budget_v1',
    'public.record_planning_intake_provider_destination_v1', 'public.claim_planning_intake_place_v1',
    'public.claim_planning_intake_work_v1', 'turn_private.read_planning_qualified_intake_v1',
    'turn_private.planning_v2_run_basis', 'turn_private.planning_v2_exact_model_basis',
    'public.hosted_worker_ready_groups', 'public.hosted_planning_target_v1',
    'public.hosted_worker_heartbeat', 'public.read_hosted_worker_status',
    'public.set_hosted_worker_enabled', 'public.reserve_model_budget',
    'public.dispatch_model_budget', 'public.finish_model_budget', 'public.stop_model_budget',
    'knowledge_review_private.current_actor', 'identity_private.guard_mobile_rpc_v2',
    'identity_private.mobile_access_v2', 'turn_private.lock_text_work',
    'public.guide_place_v1', 'public.scoped_trip_edit_budget_v1',
    'public.authorize_scoped_trip_edit_effect_v1', 'public.scoped_trip_edit_dispatch_v1',
    'public.privacy_core_export_v1', 'export_private.profile_source_v1',
    'export_private.profile_hooks_valid_v1', 'profile_data_private.schema_v1',
    'conversation_data_private.schema_supported_v1', 'result_data_private.schema_supported_v1',
    'turn_data_private.schema_supported_v1', 'turn_data_private.runtime_supported_v1',
    'turn_data_private.write_hooks_valid_v1', 'turn_data_private.export_source_v1',
    'public.assistant_conversation_export_owner_v1', 'public.privacy_profile_data_v1',
}

def scan(s):
    """Return top-level CREATE functions; ignore quoted SQL within DO/source strings."""
    i = 0
    while i < len(s):
        if s.startswith('--', i):
            end = s.find('\n', i); i = len(s) if end < 0 else end + 1; continue
        if s.startswith('/*', i):
            end = s.find('*/', i + 2); i = len(s) if end < 0 else end + 2; continue
        m = re.match(r'create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\(', s[i:], re.I)
        if m:
            # All repository PL/pgSQL function bodies use dollar-quoting.
            q = re.search(r'\$[A-Za-z_0-9]*\$', s[i + m.end():])
            if q:
                start = i + m.end() + q.start(); tag = q.group()
                end = s.find(tag, start + len(tag))
                if end < 0: raise ValueError('unterminated function ' + m[1])
                semi = s.find(';', end + len(tag))
                yield m[1].lower(), i, s[i:semi + 1]
                i = semi + 1; continue
        if s[i] == "'":
            i += 1
            while i < len(s):
                if s.startswith("''", i): i += 2; continue
                if s[i] == "'": i += 1; break
                i += 1
            continue
        q = re.match(r'\$[A-Za-z_0-9]*\$', s[i:])
        if q:
            end = s.find(q.group(), i + len(q.group()))
            if end < 0: raise ValueError('unterminated dollar quote')
            i = end + len(q.group()); continue
        i += 1

if __name__ == '__main__':
    files = sorted((ROOT / 'supabase/migrations').glob('*.sql'))
    latest = {}; refs = {}; entries = []; names_found = set()
    for path in files:
        s = path.read_text()
        entries.append({'path': str(path.relative_to(ROOT)), 'sha256': hashlib.sha256(s.encode()).hexdigest()})
        for name, pos, ddl in scan(s):
            names_found.add(name)
            if name in names:
                latest[name] = {'path': str(path.relative_to(ROOT)), 'line': s.count('\n', 0, pos) + 1,
                                'sha256': hashlib.sha256(ddl.encode()).hexdigest(), 'ddl': ddl}
        for name in names:
            for line_n, line in enumerate(s.splitlines(), 1):
                if name in line and not re.match(r'\s*(create|revoke|grant|--)', line, re.I):
                    refs.setdefault(name, []).append({'path': str(path.relative_to(ROOT)), 'line': line_n,
                        'kind': 'source_reference_may_be_dynamic_replacement_or_pin'})
    (OUT / 'before-static').mkdir(exist_ok=True)
    for name, row in latest.items():
        (OUT / 'before-static' / (name + '.sql')).write_text(row.pop('ddl') + '\n')
        row['references'] = refs.get(name, [])
        row['catalogVerified'] = False
        row['reason'] = 'explicit source DDL only; dynamic DO replacements and pg_get_functiondef metadata require PG17 replay'
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    out = {'head': head, 'migrationCount': len(files), 'migrationManifest': entries,
           'functions': latest, 'unresolvedNames': sorted(names - latest.keys()),
           'allExplicitFunctionNames': sorted(names_found), 'catalogReplay': 'UNRUN'}
    (OUT / 'source-inventory.json').write_text(json.dumps(out, indent=2) + '\n')
    print(json.dumps({'head': head, 'migrationCount': len(files), 'explicitOwnedFunctions': len(latest),
                      'unresolvedNames': out['unresolvedNames'], 'catalogReplay': 'UNRUN'}))
