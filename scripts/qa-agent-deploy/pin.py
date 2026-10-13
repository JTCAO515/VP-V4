#!/usr/bin/env python3
"""Prepare exact immutable Git preview/binding requests; performs no mutations."""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from snapshot import BRANCH, DOMAIN, PROJECT, TEAM, OUTPUT, api

SOURCE = Path('/Users/jtsm5p/Documents/Codex/VP-V10-worktrees/qaw005-main-20261013')
APPROVED_REF = 'dzqdzetcctkhbrhlxxgn'
QA_BRANCHES = (BRANCH, 'codex/qaw005-independent-target-20261013')
REF_KEY = 'VISEPANDA_QA_SUPABASE_PROJECT_REF'


def git(*args):
    return subprocess.check_output(['git', '-C', str(SOURCE), *args], text=True).strip()


def validate_binding(project, domain, branch, expected_domain_branch, target_ref):
    if branch not in QA_BRANCHES or expected_domain_branch not in QA_BRANCHES:
        raise ValueError('Unapproved QA branch')
    if not isinstance(target_ref, str) or not re.fullmatch('[a-z0-9]{20}', target_ref) or target_ref != APPROVED_REF:
        raise ValueError('Explicit approved shared target reference required')
    link = project.get('link') or {}
    if (project.get('id'), project.get('accountId'), link.get('org'), link.get('repo'),
        link.get('productionBranch')) != (PROJECT, TEAM, 'JTCAO515', 'VP-V4', 'main'):
        raise ValueError('Live project/team/Git connection mismatch')
    if (domain.get('name'), domain.get('projectId'), domain.get('gitBranch')) != (DOMAIN, PROJECT, expected_domain_branch):
        raise ValueError('Current QA domain scope changed')
    selected = [item for item in project.get('env', [])
                if 'preview' in item.get('target', []) and item.get('gitBranch') in (None, branch)
                and item.get('key', '').startswith('VISEPANDA_QA')]
    if any(item.get('key') == 'VISEPANDA_QA_AGENT' for item in selected):
        raise ValueError('QA enable variable exists; cannot attest disabled from names only')
    refs = [item for item in selected if item.get('key') == REF_KEY]
    if any(item.get('type') != 'plain' or item.get('value') != target_ref for item in refs):
        raise ValueError('Existing target reference is opaque or differs; never overwrite it')
    safe = [{k: item.get(k) for k in ('key', 'type', 'target', 'gitBranch')} for item in selected]
    return safe


def make_package(sha, branch, expected_domain_branch, target_ref, candidate, remote_sha, env_names, source_hashes):
    if not re.fullmatch('[0-9a-f]{40}', sha):
        raise ValueError('Require full exact source SHA')
    if branch not in QA_BRANCHES or expected_domain_branch not in QA_BRANCHES or target_ref != APPROVED_REF:
        raise ValueError('Unapproved target scope')
    if not candidate and remote_sha != sha:
        raise ValueError('Reviewed remote branch differs from exact source pin')
    return {
        'mode': 'candidate_read_only' if candidate else 'reviewed_source_request_preparation',
        'sourceSha': sha, 'sourceBranch': branch, 'remoteSha': remote_sha,
        'remoteExactMatch': remote_sha == sha, 'projectId': PROJECT, 'teamId': TEAM,
        'approvedTarget': {'kind': 'explicit-shared', 'projectRef': target_ref,
                           'databaseUrl': 'https://' + target_ref + '.supabase.co'},
        'effectiveQaEnvironmentNames': env_names, 'sourceSha256': source_hashes,
        'nonsecretPreviewConfigCandidate': [
            {'key': REF_KEY, 'value': target_ref, 'type': 'plain', 'target': ['preview'], 'gitBranch': branch},
            {'key': 'VISEPANDA_QA_AGENT_ORIGIN', 'value': 'https://' + DOMAIN, 'type': 'plain', 'target': ['preview'], 'gitBranch': branch}],
        'publicUrlRequiredBeforeRuntime': 'NEXT_PUBLIC_SUPABASE_URL must exactly equal the approved target URL; key values are not read/copied',
        'sourceContractVersions': {'hostedProfile': 'vpj07-hosted-text-worker/4', 'targetPackage': 'qa-hosted-deployment-target/2'},
        'previewRequest': {'name': 'vp-v4', 'project': PROJECT,
            'gitSource': {'type': 'github', 'org': 'JTCAO515', 'repo': 'VP-V4',
                          'ref': branch, 'sha': sha}, 'withLatestCommit': False},
        'currentDomain': {'name': DOMAIN, 'gitBranch': expected_domain_branch},
        'domainPatchCandidate': {'name': DOMAIN, 'gitBranch': branch},
        'domainChangeRequired': expected_domain_branch != branch,
        'domainChangeAllowedByThisTool': False,
        'cutoverGate': 'Main exact-head review and required CI PASS must be provided before changing the live QA domain; preparation is not that evidence',
        'flagsOrBudgetEnabledByThisTool': False, 'credentialsReadOrCopied': False,
        'runtimeAuthSessionProviderAndBudget': 'UNRUN',
        'authorityBoundary': 'Shared target approval and database capture/rehearsal A-D plus conditional E do not authorize model spend or runtime activation',
        'resourceMutations': 0,
    }


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--reviewed-sha')
    mode.add_argument('--candidate-sha')
    parser.add_argument('--branch', choices=QA_BRANCHES, required=True)
    parser.add_argument('--expected-domain-branch', choices=QA_BRANCHES, required=True)
    parser.add_argument('--target-ref', required=True)
    args = parser.parse_args()
    sha = args.candidate_sha or args.reviewed_sha
    if not re.fullmatch('[0-9a-f]{40}', sha):
        raise SystemExit('Require full exact source SHA')
    if git('rev-parse', sha + '^{commit}') != sha:
        raise SystemExit('Exact immutable commit unavailable')
    # Only Git objects are used. Never upload or alter a concurrently edited checkout.
    for path in ('app/qa', 'app/api/qa-agent'):
        if not git('ls-tree', '-r', '--name-only', sha, path):
            raise SystemExit('QA product source path missing: ' + path)
    paths = ('docs/contracts/qa-independent-target.md', 'lib/server/qa-agent/target.ts',
             'lib/server/qa-agent/config.ts', 'lib/server/qa-agent/hosted-profile.ts',
             'deploy/hosted-worker/validate-qa-target.mjs', 'lib/server/qa-agent/worker.ts')
    sources = {path: subprocess.check_output(['git', '-C', str(SOURCE), 'show', sha + ':' + path]) for path in paths}
    if b'VISEPANDA_QA_SUPABASE_PROJECT_REF' not in sources[paths[0]] or b'VISEPANDA_QA_SUPABASE_PROJECT_REF' not in sources[paths[2]] or APPROVED_REF.encode() not in sources[paths[1]]:
        raise SystemExit('Explicit target source contract missing')
    if b'vpj07-hosted-text-worker/4' not in sources['lib/server/qa-agent/hosted-profile.ts'] or b'qa-hosted-deployment-target/2' not in sources['deploy/hosted-worker/validate-qa-target.mjs']:
        raise SystemExit('Current reviewed profile/target version source missing')
    remote = git('ls-remote', 'origin', 'refs/heads/' + args.branch).split()
    remote_sha = remote[0] if len(remote) == 2 else None
    project = api('/v9/projects/' + PROJECT)
    domain = api('/v9/projects/' + PROJECT + '/domains/' + DOMAIN)
    try:
        env_names = validate_binding(project, domain, args.branch, args.expected_domain_branch, args.target_ref)
        package = make_package(sha, args.branch, args.expected_domain_branch, args.target_ref,
            bool(args.candidate_sha), remote_sha, env_names,
            {path: hashlib.sha256(value).hexdigest() for path, value in sources.items()})
    except ValueError as error:
        raise SystemExit(str(error))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    output = OUTPUT / ('binding-candidate-' + sha[:12] + '.json' if args.candidate_sha else 'pinned-deployment-request.json')
    output.write_text(json.dumps(package, indent=2) + '\n')
    print(json.dumps({'mode': package['mode'], 'sourceSha': sha, 'branch': args.branch,
        'remoteExactMatch': package['remoteExactMatch'], 'targetRef': args.target_ref,
        'currentDomainBranch': args.expected_domain_branch, 'domainChanged': False,
        'output': str(output), 'resourceMutations': 0}))


if __name__ == '__main__':
    main()
