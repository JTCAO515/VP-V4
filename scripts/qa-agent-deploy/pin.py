#!/usr/bin/env python3
"""Prepare an exact reviewed Git deployment payload; performs no deployment."""
import argparse
import json
import re
import subprocess
from pathlib import Path
from snapshot import BRANCH, DOMAIN, PROJECT, TEAM, OUTPUT, api

SOURCE = Path('/Users/jtsm5p/Documents/Codex/VP-V10-worktrees/qaw005-main-20261013')


def git(*args):
    return subprocess.check_output(['git', '-C', str(SOURCE), *args], text=True).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--reviewed-sha', required=True)
    args = parser.parse_args()
    sha = args.reviewed_sha
    if not re.fullmatch('[0-9a-f]{40}', sha):
        raise SystemExit('Require full reviewed SHA')
    if git('rev-parse', '--abbrev-ref', 'HEAD') != BRANCH:
        raise SystemExit('Wrong source branch')
    if git('rev-parse', 'HEAD') != sha or git('status', '--porcelain'):
        raise SystemExit('Source differs from reviewed pin or has pending changes')
    remote = git('ls-remote', 'origin', 'refs/heads/' + BRANCH).split()
    if len(remote) != 2 or remote[0] != sha:
        raise SystemExit('Remote branch missing or differs from reviewed pin')
    for path in ('app/qa', 'app/api/qa-agent'):
        if not git('ls-tree', '-r', '--name-only', sha, path):
            raise SystemExit(f'QA product path missing: {path}; baseline is not deliverable')
    project = api(f'/v9/projects/{PROJECT}')
    link = project.get('link') or {}
    if (project.get('id'), project.get('accountId'), link.get('org'), link.get('repo'),
        link.get('productionBranch')) != (PROJECT, TEAM, 'JTCAO515', 'VP-V4', 'main'):
        raise SystemExit('Live project/team/Git connection mismatch')
    domain = api(f'/v9/projects/{PROJECT}/domains/{DOMAIN}')
    if domain.get('gitBranch') != BRANCH or domain.get('projectId') != PROJECT:
        raise SystemExit('QA domain scope mismatch')
    payload = {'name': 'vp-v4', 'project': PROJECT, 'target': 'preview',
        'gitSource': {'type': 'github', 'org': 'JTCAO515', 'repo': 'VP-V4',
                      'ref': BRANCH, 'sha': sha}, 'withLatestCommit': False}
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / 'pinned-deployment-request.json').write_text(json.dumps(payload, indent=2) + '\n')
    print(json.dumps({'reviewedSha': sha, 'request': str(OUTPUT / 'pinned-deployment-request.json'),
                      'target': 'preview', 'mutations': 0}))


if __name__ == '__main__':
    main()
