"""Offline-only QA encrypted backup candidate. No execution/credential/network API.

This is an inspectable specification, not an approved backup runner. Metadata
fixtures are historical evidence, never authentication or live preflight proof.
"""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
REF = 'dzqdzetcctkhbrhlxxgn'
ACCOUNT = {'name': 'Go2China', 'link_id': 'link_6acdbe0471c081919ff47de24ca53b0f'}
ORGANIZATION = 'ppfsagymaozpbkbarhes'
VERSION_HASH = '55081cf98085b602190d951112ae3bbaa76ec5db9a96d504d61c6433987e07cd'
SCHEMAS = tuple(sorted((
    'public', 'auth', 'storage', 'private', 'identity_private',
    'knowledge_review_private', 'turn_private', 'supabase_migrations',
    'community_private', 'ops_budget_private', 'place_quota_private',
    'privacy_private', 'research_intake_private', 'service_cases_private',
)))
PLATFORM_DATA = {'auth', 'storage', 'supabase_migrations'}
ARCHIVE_ROOT = '/Users/jtsm5p/.codex/secure-backups/qaw005-fixed-staging/archives'
IDENTITY_ROOT = '/Users/jtsm5p/.codex/secure-backups/qaw005-fixed-staging/identities'
CA_URL = 'https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt'
CA_HASH = '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'
PG_ROOT = '/opt/homebrew/opt/postgresql@17/bin'


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def validate_versions(versions):
    require(isinstance(versions, list) and len(versions) == 75, 'MIGRATION_COUNT_CONFLICT')
    require(all(isinstance(v, str) and len(v) == 14 and v.isascii() and v.isdigit()
                for v in versions), 'MIGRATION_FORMAT_CONFLICT')
    require(versions == sorted(set(versions)), 'MIGRATION_ORDER_OR_DUPLICATE')
    digest = hashlib.sha256(('\n'.join(versions) + '\n').encode()).hexdigest()
    require(digest == VERSION_HASH, 'MIGRATION_SET_CONFLICT')
    return digest


def validate_business_schemas(schemas):
    require(isinstance(schemas, list) and all(isinstance(s, str) for s in schemas),
            'SCHEMA_FORMAT_CONFLICT')
    require(len(schemas) == len(set(schemas)) and
            set(schemas) == set(SCHEMAS) - PLATFORM_DATA, 'SCHEMA_SET_CONFLICT')


def validate_live_metadata_shape(observation):
    """Pure negative-testable contract; success does NOT authenticate a JSON file.

    A future authorized operator must obtain these via the pinned official
    account in the current operation, reconcile full pg_namespace inventory and
    verify the approved DB transport/session identity independently.
    """
    require(observation.get('account') == ACCOUNT, 'ACCOUNT_CONFLICT')
    require(observation.get('project') == REF and
            observation.get('organization') == ORGANIZATION, 'PROJECT_CONFLICT')
    require(observation.get('status') == 'ACTIVE_HEALTHY', 'PROJECT_NOT_HEALTHY')
    require(observation.get('postgres_version') == '17.6.1.155', 'ENGINE_CHANGED_REVIEW_REQUIRED')
    validate_versions(observation.get('versions'))
    validate_business_schemas(observation.get('business_schemas'))
    require(observation.get('data_schemas') == list(SCHEMAS), 'DATA_SCHEMA_SET_CONFLICT')


def candidate(snapshot, metadata):
    validate_versions(snapshot.get('applied'))
    validate_business_schemas(metadata.get('schemas'))
    return {
        'status': 'OFFLINE_CANDIDATE_ONLY_LIVE_EXECUTION_UNAVAILABLE',
        'target': REF, 'account': ACCOUNT, 'organization': ORGANIZATION,
        'expectedPostgres': '17.6.1.155', 'migrationCount': 75,
        'migrationHashAlgorithm': 'sha256(sorted versions joined by LF plus final LF)',
        'migrationSha256': VERSION_HASH, 'dataSchemas': list(SCHEMAS),
        'archiveDirectory': ARCHIVE_ROOT, 'identityDirectory': IDENTITY_ROOT,
        'directoryMode': '0700', 'fileMode': '0600', 'creation': 'UNRUN',
        'oldArchives': 'Sep19 status supplied by Main, not inspected; never a current recovery point',
        'livePreflight': [
            'Separate scoped authorization and operator confirmation for data read, backup destination/retention and restore; fixture/dry-run is never authorization',
            'Fresh official Go2China get_project + list_migrations and complete namespace inventory in this operation; exact project/org/engine/75-version hash and fourteen data schemas must match; unknown namespace or migration stops',
            'Independently verify approved database transport/account/session identity using metadata only; plugin identity does not prove CLI identity; do not acquire temporary login credentials or SET ROLE by inference',
            'FileVault On, trusted age/age-keygen, pg_dump and pg_restore major17; symlink-free owned ancestor chain; umask077; separate new exclusive0700 archive/identity subdirectories; no archive/key reuse',
            'Review all owners/default ACLs/role memberships/extensions/event triggers and dependent platform namespaces; fourteen data schemas alone do not prove recoverability',
            'Quiesce writers/migrators for final recovery point or separately validate a consistent snapshot and concurrent DDL protection; recheck versions/schema at snapshot boundary and after dump; abort on drift',
        ],
        'tls': {'host': 'db.' + REF + '.supabase.co', 'sslmode': 'verify-full',
                'caUrl': CA_URL, 'caSha256': CA_HASH,
                'state': 'Historical pin; validate official source under future authorization; mismatch fails closed'},
        'dumpArgvTemplate': [PG_ROOT + '/pg_dump', '-Fc', '--strict-names',
                             '--host=db.' + REF + '.supabase.co',
                             '--username=<independently-verified-approved-role>', '--dbname=postgres',
                             *['--schema=' + s for s in SCHEMAS]],
        'credentialRule': 'No values in argv/report/files; future approved secure credential handoff only. No CLI credential helper in this candidate.',
        'encryptionProtocol': [
            'Generate fresh identity exclusively in separate0700 identity directory with0600 file; derive recipient in memory; neither value logged',
            'Stream pg_dump custom archive stdout directly to age -r recipient; stdout exclusively to new0600 .partial ciphertext; never plaintext temporary dump',
            'Preserve owner/ACL archive entries; intentionally omit old --no-owner/--no-privileges/--role=postgres options; required privileges must be independently authorized, never escalated automatically',
            'Use bounded pipeline deadline, concurrently drain/suppress stderr, check both process statuses; on any error stop/reap both children and mark failed; no raw database diagnostics',
            'Consume complete age-decrypted stream to null and require exit0 before TOC inspection. Early TOC success alone is not ciphertext integrity proof',
            'Second decrypt into pg_restore -l in memory; validate exact required schema objects and table-data entries versus snapshot catalog manifest, ACL/owner/dependency coverage; count>20 is insufficient',
            'Hash complete ciphertext with streaming SHA256, fsync and promote .partial only after checks. Preserve failed artifacts under protected quarantine for operator disposition; do not delete keys automatically',
            'Emit only sanitized manifest: observation time, project/account evidence refs, versions/schema hash, bytes/hash, TOC coverage, role/platform gaps, RESTORE_UNRUN; do not emit content/keys/credentials',
        ],
        'remainingRestoreDependencies': [
            'Authorized isolated target with compatible Supabase managed Auth/Storage/roles/extensions/platform hooks and event triggers',
            'Current archive restore test with complete schema/ACL/sequence/trigger and content-free integrity checks; original revocation fences retained',
            'Main official metadata reported storage.objects=0 and storage.buckets=0 on 2026-10-13; not independently rechecked here. Fresh recheck before backup; preserve storage schema; cover bytes separately if no longer empty',
            '75-to155 replay plus actual-data recovery rehearsal; synthetic PASS is not target recovery evidence',
        ],
        'blockingReuseFindings': [
            'Old eight-schema list omits six live business schemas',
            'Old --no-owner/--no-privileges cannot prove ownership/ACL restoration',
            'Old CLI temporary-role + --role=postgres does not establish authorized same-account transport',
            'Old archiveItems>=20 does not establish fourteen-schema/dependency/data completeness',
            'Old proxy relay has forty-second connection deadline; unsuitable until backup duration/transport is separately verified',
        ],
        'targetRead': 'UNRUN', 'encryptedBackup': 'UNRUN', 'restore': 'UNRUN',
    }


def main(args):
    require(args == ['--dry-run'], 'OFFLINE_ONLY_USE_DRY_RUN')
    base = ROOT / 'artifacts/QAWEB/staging-replay'
    return candidate(json.loads((base / 'observed.json').read_text()),
                     json.loads((base / 'target-metadata.json').read_text()))


if __name__ == '__main__':
    try:
        print(json.dumps(main(sys.argv[1:]), indent=2))
    except (ValueError, OSError, json.JSONDecodeError) as error:
        # No input echo, traceback, credentials or raw file contents.
        reason = str(error) if isinstance(error, ValueError) and not isinstance(error, json.JSONDecodeError) else 'LOCAL_METADATA_UNAVAILABLE'
        print(json.dumps({'status': 'REJECTED', 'reason': reason}))
        sys.exit(1)
