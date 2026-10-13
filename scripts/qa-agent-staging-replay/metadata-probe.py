"""Explicit metadata-only probe; never dumps application rows or creates keys.
Only --probe-metadata enables the scoped read. Secrets/raw subprocess output
never escape this process; failures are classified without printing exceptions.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import urllib.request

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


plan = module('backup_plan', HERE / 'backup-candidate.py')


def checked(argv, *, env=None, stdin=None, timeout=30):
    try:
        r = subprocess.run(argv, input=stdin, env=env, capture_output=True,
                           text=True, timeout=timeout)
    except Exception:
        raise ValueError('PROCESS_UNAVAILABLE_OR_TIMEOUT') from None
    if r.returncode:
        # Do not return/print raw error strings: libpq/CLI may include secrets.
        code = re.search(r'(?:ERROR|FATAL):\s+([0-9A-Z]{5})\b', r.stderr)
        if code:
            raise ValueError('SQLSTATE_' + code[1])
        for token, reason in [('permission denied', 'DB_PERMISSION_DENIED'), ('certificate', 'TLS_CERTIFICATE_ERROR'), ('timeout', 'NETWORK_TIMEOUT'), ('authentication failed', 'AUTHENTICATION_FAILED'), ('could not connect', 'CONNECT_FAILED'), ('Connection refused', 'CONNECT_REFUSED')]:
            if token in r.stderr:
                raise ValueError(reason)
        raise ValueError('PROCESS_NONZERO')
    return r.stdout


def parse_credentials(raw):
    # Parse, never execute the CLI-produced shell script.
    host = re.search(r'^export PGHOST="([^"\n]+)"$', raw, re.M)
    user = re.search(r'^export PGUSER="([^"\n]+)"$', raw, re.M)
    password = re.search(r'^export PGPASSWORD="([A-Za-z0-9_-]{20,})"$', raw, re.M)
    plan.require(host and host[1] == 'db.' + plan.REF + '.supabase.co', 'CLI_HOST_CONFLICT')
    plan.require(user and user[1] == 'cli_login_postgres', 'CLI_ROLE_CONFLICT')
    plan.require(password is not None, 'TEMPORARY_CREDENTIAL_UNAVAILABLE')
    return password[1]


def main(args):
    plan.require(args == ['--probe-metadata'], 'METADATA_PROBE_ARGUMENT_REQUIRED')
    report = {'status': 'FAIL_METADATA_ONLY', 'target': plan.REF,
              'secretOutput': False, 'userRowsRead': False, 'keysCreated': False,
              'roleSwitched': False, 'backup': 'UNRUN', 'restore': 'UNRUN'}
    stage = 'CLI project inventory'
    try:
        projects = json.loads(checked(['supabase', 'projects', 'list', '--output-format', 'json']))['projects']
        matches = [p for p in projects if p.get('id') == plan.REF]
        plan.require(len(matches) == 1, 'PROJECT_NOT_UNIQUE')
        p = matches[0]
        plan.require(p.get('organization_id') == plan.ORGANIZATION and p.get('name') == 'VP - V4'
                     and p.get('status') == 'ACTIVE_HEALTHY'
                     and p.get('database', {}).get('version') == '17.6.1.155', 'PROJECT_STATE_CONFLICT')
        report['projectInventory'] = {'ref': p['id'], 'organization': p['organization_id'],
                                      'linked': p.get('linked'), 'status': p['status']}
        report['accountLimit'] = 'Same explicit project/org accessible in CLI and official Go2China; human OAuth subject equality not exposed/proven'
        stage = 'temporary credential acquisition'
        password = parse_credentials(checked(['supabase', 'db', 'dump', '--linked', '--project-ref', plan.REF, '--dry-run']))
        stage = 'pinned official CA'
        # Public CA is the only temporary file; never credentials or database content.
        with tempfile.TemporaryDirectory(prefix='probe-ca-', dir=ROOT / 'artifacts/QAWEB/staging-replay') as tmp:
            with urllib.request.urlopen(plan.CA_URL, timeout=15) as response:
                ca_bytes = response.read(32769)
            plan.require(hashlib.sha256(ca_bytes).hexdigest() == plan.CA_HASH, 'CA_PIN_CONFLICT')
            ca = Path(tmp) / 'root.crt'
            ca.write_bytes(ca_bytes)
            relay = module('metadata_relay', ROOT / 'scripts/db/vpj02_proxy.py')
            stage = 'TLS read-only metadata query'
            with relay.direct_relay() as (address, port):
                env = {k: os.environ[k] for k in ('PATH', 'HOME', 'TMPDIR') if k in os.environ}
                env.update(PGPASSWORD=password, PGHOSTADDR=address, PGSSLMODE='verify-full',
                           PGSSLROOTCERT=str(ca), PGGSSENCMODE='disable', PGCONNECT_TIMEOUT='8',
                           PGAPPNAME='qaw005-metadata-only', PGOPTIONS='-c default_transaction_read_only=on', LC_ALL='C')
                password = None
                try:
                    raw = checked([plan.PG_ROOT + '/psql', '-X', '-q', '-At', '-w', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate',
                                   '-h', 'db.' + plan.REF + '.supabase.co', '-p', str(port),
                                   '-U', 'cli_login_postgres', '-d', 'postgres'], env=env,
                                  stdin=(HERE / 'metadata-probe.sql').read_text(), timeout=25)
                finally:
                    env.pop('PGPASSWORD', None)
        metadata = json.loads(raw)
        stage = 'fresh metadata pins'
        plan.require(metadata['session_user'] == metadata['current_user'] == 'cli_login_postgres', 'SESSION_IDENTITY_CONFLICT')
        plan.require(metadata['read_only'] == 'on' and metadata['tls']['ssl'] is True, 'READ_ONLY_TLS_REQUIRED')
        official = json.loads((ROOT / 'artifacts/QAWEB/staging-replay/probe-official-metadata.json').read_text())
        plan.validate_versions(official['versions'])
        report['migrationVerification'] = 'Exact75 verified using fresh official Go2China catalog response; CLI role migration-history read failed42501 and was removed from narrowed catalog probe'
        for field in ('schemas', 'event_triggers'):
            plan.require(metadata[field] == official[field], 'OFFICIAL_METADATA_CONFLICT_' + field.upper())
        plan.require(set(plan.SCHEMAS).issubset(metadata['schemas']), 'DATA_SCHEMA_COVERAGE_CONFLICT')
        report['metadata'] = metadata
        denied = [r['schema'] + '.' + r['name'] for r in metadata['relations'] if not r['select']]
        current = next(r for r in metadata['roles'] if r['name'] == 'cli_login_postgres')
        report['readAccess'] = {'relations': len(metadata['relations']), 'selectDenied': denied,
                              'currentRoleSuperuser': current['superuser'], 'currentRoleBypassRls': current['bypassrls'],
                              'canSetPostgres': metadata['can_set_postgres'],
                              'setRoleActuallyPerformed': False}
        report['status'] = 'PASS_METADATA_PROBE_ONLY'
        report['backupReadiness'] = 'UNPROVEN: grants alone do not prove RLS-complete dump, global-role restore, or managed-platform restore'
    except Exception as exc:
        report['failedStage'] = stage
        report['reason'] = str(exc) if isinstance(exc, ValueError) and re.fullmatch(r'[A-Z_0-9]+', str(exc)) else 'PROBE_FAILED_DETAILS_SUPPRESSED'
    return report


if __name__ == '__main__':
    try:
        output = main(sys.argv[1:])
        print(json.dumps(output, indent=2))
        sys.exit(0 if output['status'] == 'PASS_METADATA_PROBE_ONLY' else 1)
    except Exception:
        print('{"status":"REJECTED","reason":"METADATA_PROBE_ARGUMENT_REQUIRED"}')
        sys.exit(1)
