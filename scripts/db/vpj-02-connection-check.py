"""Bounded operator-run SQL connection checks; no stored credential or remote writes."""
import argparse
import datetime
import getpass
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import urllib.request
import warnings

REF = 'dzqdzetcctkhbrhlxxgn'
CA_URL = 'https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt'
CA_SHA256 = '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'
ROOT = Path(__file__).resolve().parents[2]
TARGETS = (
    ('direct', f'db.{REF}.supabase.co', 5432, 'postgres'),
    ('sessionPooler', 'aws-0-ap-southeast-1.pooler.supabase.com', 5432, f'postgres.{REF}'),
    ('transactionPoolerProfile', 'aws-0-ap-southeast-1.pooler.supabase.com', 6543, f'postgres.{REF}'),
)
SQL = """begin read only;
set local statement_timeout='8s';
select json_build_object(
 'expectedIdentity', current_user='postgres' and session_user='postgres',
 'expectedDatabase', current_database()='postgres',
 'readOnly', current_setting('transaction_read_only')='on',
 'authCount', (select count(*) from auth.users),
 'tripCount', (select count(*) from public.trips),
 'directTripUpdateRevoked', not has_table_privilege('authenticated','public.trips','UPDATE'),
 'versions', (select json_agg(version order by version) from supabase_migrations.schema_migrations)
);
rollback;"""


def error_kind(message):
    text = message.lower()
    if 'password authentication failed' in text or 'wrong password' in text:
        return 'AUTHENTICATION_FAILED'
    if 'certificate' in text or 'ssl error' in text:
        return 'TLS_VERIFICATION_FAILED'
    if 'timeout' in text or 'timed out' in text:
        return 'TIMEOUT'
    if 'closed' in text or 'eof' in text:
        return 'CONNECTION_CLOSED'
    return 'CONNECTION_OR_QUERY_FAILED'


def sql_environment(password, ca_path):
    # Ignore all inherited PG*, service/password files and psql startup commands.
    env = {k: os.environ[k] for k in ('PATH', 'HOME', 'TMPDIR') if k in os.environ}
    env.update(PGPASSWORD=password, PGSSLMODE='verify-full', PGSSLROOTCERT=str(ca_path),
               PGGSSENCMODE='disable', PGCONNECT_TIMEOUT='8', LC_ALL='C',
               PGAPPNAME='vpj02-readonly-check')
    return env


def verify_result(raw, local_versions):
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError('RESULT_CONTRACT_FAILED')
    keys = ('expectedIdentity', 'expectedDatabase', 'readOnly', 'directTripUpdateRevoked')
    versions = value.get('versions')
    valid = (all(value.get(k) is True for k in keys)
             and isinstance(versions, list) and len(versions) >= 24
             and all(isinstance(v, str) and v in local_versions for v in versions)
             and len(set(versions)) == len(versions)
             and set(local_versions[:24]).issubset(versions)
             and all(type(value.get(k)) is int and value[k] >= 0 for k in ('authCount', 'tripCount')))
    if not valid:
        raise ValueError('RESULT_CONTRACT_FAILED')
    # Never relay unrecognized server-returned keys or free-form values.
    return {**{k: value[k] for k in keys}, 'authCount': value['authCount'],
            'tripCount': value['tripCount'], 'migrationCount': len(versions)}


def tls_probe(host, port, ca_path):
    result = {'host': host, 'port': port, 'tls': 'FAIL', 'sql': 'UNRUN'}
    try:
        resolved = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        result['ipv6Available'] = any(item[0] == socket.AF_INET6 for item in resolved)
        result['proxyBenchmarkAddress'] = any(
            item[0] == socket.AF_INET and ipaddress.ip_address(item[4][0]) in ipaddress.ip_network('198.18.0.0/15')
            for item in resolved)
        context = ssl.create_default_context(cafile=str(ca_path))
        with socket.create_connection((host, port), timeout=8) as connection:
            connection.settimeout(8)
            connection.sendall(bytes.fromhex('0000000804d2162f'))
            if connection.recv(1) != b'S':
                result['reason'] = 'POSTGRES_TLS_NOT_ESTABLISHED'
                return result
            with context.wrap_socket(connection, server_hostname=host) as secured:
                result['tls'] = 'PASS'
                result['tlsVersion'] = secured.version()
    except (OSError, ssl.SSLError) as exc:
        result['reason'] = error_kind(str(exc))
    return result


def main():
    parser = argparse.ArgumentParser(description='VPJ-02 指定 Staging 只读连接验证。密码仅在终端隐藏输入。')
    parser.add_argument('--preflight', action='store_true', help='仅检查 DNS/TLS，不索取密码')
    args = parser.parse_args()
    report = {'project': REF, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'workerRuntime': 'UNRUN: transaction connection profile is not a running SystemDataAdapter', 'paths': {}}
    directory = ROOT / 'artifacts/VPJ-02/staging-verification-20260917'
    directory.mkdir(parents=True, exist_ok=True)
    fd, receipt = tempfile.mkstemp(prefix='connections-', suffix='.json', dir=directory)
    os.close(fd)
    exit_code = 1
    try:
        with tempfile.TemporaryDirectory(prefix='vpj02-ca-') as temporary:
            ca = Path(temporary) / 'root.crt'
            with urllib.request.urlopen(CA_URL, timeout=15) as response:
                data = response.read(32769)
            if len(data) > 32768 or hashlib.sha256(data).hexdigest() != CA_SHA256:
                raise ValueError('CA_CHANGED_OR_INVALID')
            ca.write_bytes(data)
            report['caSha256'] = CA_SHA256
            for name, host, port, _ in TARGETS:
                report['paths'][name] = tls_probe(host, port, ca)
            if args.preflight:
                report['status'] = 'PREFLIGHT_ONLY'
                return 0 if all(p['tls'] == 'PASS' for p in report['paths'].values()) else 1
            psql = shutil.which('psql')
            if not psql:
                raise ValueError('PSQL_UNAVAILABLE')
            if not any(p['tls'] == 'PASS' for p in report['paths'].values()):
                raise ValueError('NO_VERIFIED_TLS_PATH')
            if not sys.stdin.isatty():
                raise ValueError('INTERACTIVE_TERMINAL_REQUIRED')
            with warnings.catch_warnings():
                warnings.simplefilter('error', getpass.GetPassWarning)
                password = getpass.getpass('输入 VP - V4 数据库密码（不显示、不保存；不是登录密码/API key）：')
            if not password or '\x00' in password:
                raise ValueError('PASSWORD_INPUT_INVALID')
            local = sorted(p.name[:14] for p in (ROOT / 'supabase/migrations').glob('*.sql'))
            for name, host, port, user in TARGETS:
                entry = report['paths'][name]
                if entry['tls'] != 'PASS':
                    continue
                try:
                    completed = subprocess.run([psql, '-X', '-w', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1',
                                                '-h', host, '-p', str(port), '-U', user, '-d', 'postgres'],
                                               input=SQL, capture_output=True, text=True, timeout=25,
                                               env=sql_environment(password, ca))
                    if completed.returncode:
                        entry.update(sql='FAIL', reason=error_kind(completed.stderr))
                        if entry['reason'] == 'AUTHENTICATION_FAILED':
                            break  # No password guessing/repeated authentication on other ports.
                    else:
                        entry.update(sql='PASS', result=verify_result(completed.stdout.strip(), local))
                except (OSError, subprocess.TimeoutExpired, ValueError):
                    entry.update(sql='FAIL', reason='QUERY_OR_RESULT_FAILED')
            password = None
            complete = all(p['sql'] == 'PASS' for p in report['paths'].values())
            report['status'] = 'SQL_CONNECTIONS_PASS_WORKER_UNRUN' if complete else 'INCOMPLETE'
            exit_code = 0 if complete else 1
    except (Exception, KeyboardInterrupt):
        report['status'] = 'INCOMPLETE_OR_CANCELLED'
    finally:
        report['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        Path(receipt).write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report, ensure_ascii=False, indent=2))
        print(f'脱敏结果已保存：{receipt}')
    return exit_code


if __name__ == '__main__':
    sys.exit(main())
