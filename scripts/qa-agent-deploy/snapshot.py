#!/usr/bin/env python3
"""Read the exact QA resource with official CLI; emit only allowlisted metadata."""
import datetime
import json
import subprocess
from pathlib import Path

PROJECT = 'prj_XwsjEc8YnYNeDVAqBrcdmbJXEqA2'
TEAM = 'team_vLT8SL2mQJJSnXbD9GzVLP4K'
BRANCH = 'codex/qaw005-main-20261013'
DOMAIN = 'qatesting.go2china.space'
OUTPUT = Path(__file__).resolve().parents[2] / 'artifacts/QAWEB/deployment-20261013'


def api(path):
    separator = '&' if '?' in path else '?'
    result = subprocess.run(['vercel', 'api', path + separator + 'teamId=' + TEAM,
                             '--method', 'GET', '--raw'], capture_output=True, text=True,
                            timeout=60)
    if result.returncode:
        # Do not forward provider/CLI raw responses that may carry confidential data.
        raise RuntimeError(f'Official CLI GET failed: {path.split("?")[0]} ({result.returncode})')
    if len(result.stdout) > 2_000_000:
        raise RuntimeError('Response exceeded bounded read limit')
    return json.loads(result.stdout)


def select(data, keys):
    return {key: data.get(key) for key in keys}


def main():
    project = api(f'/v9/projects/{PROJECT}')
    if project.get('id') != PROJECT or project.get('accountId') != TEAM:
        raise RuntimeError('Project/team mismatch')
    link = project.get('link') or {}
    if (link.get('org'), link.get('repo'), link.get('productionBranch')) != ('JTCAO515', 'VP-V4', 'main'):
        raise RuntimeError('Git connection mismatch')
    project_safe = select(project, ['id', 'name', 'accountId', 'framework', 'rootDirectory',
        'buildCommand', 'installCommand', 'outputDirectory', 'nodeVersion', 'ssoProtection'])
    project_safe['passwordProtectionEnabled'] = bool(project.get('passwordProtection'))
    project_safe['git'] = select(link, ['type', 'org', 'repo', 'repoId', 'productionBranch'])
    project_safe['env'] = [select(item, ['key', 'type', 'target', 'gitBranch'])
                           for item in project.get('env', [])]
    domain = api(f'/v9/projects/{PROJECT}/domains/{DOMAIN}')
    if domain.get('projectId') != PROJECT or domain.get('gitBranch') != BRANCH:
        raise RuntimeError('QA domain branch/project mismatch')
    domain_safe = select(domain, ['name', 'apexName', 'projectId', 'gitBranch', 'verified',
                                  'verification', 'redirect', 'customEnvironmentId'])
    config = api(f'/v6/domains/{DOMAIN}/config?projectIdOrName={PROJECT}')
    config_safe = select(config, ['configuredBy', 'nameservers', 'serviceType', 'cnames',
        'aValues', 'conflicts', 'acceptedChallenges', 'recommendedIPv4', 'recommendedCNAME',
        'misconfigured'])
    domains = api(f'/v9/projects/{PROJECT}/domains?limit=100')
    domains_safe = [select(item, ['name', 'projectId', 'gitBranch', 'verified', 'redirect'])
                    for item in domains.get('domains', [])]
    result = {'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'source': 'official Vercel CLI exact API/team fallback for MCP 404',
              'project': project_safe, 'qaDomain': domain_safe,
              'dns': config_safe, 'projectDomains': domains_safe}
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / 'resource-readback.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'projectId': PROJECT, 'teamId': TEAM, 'qaBranch': BRANCH,
                      'verified': domain_safe['verified'],
                      'dnsMisconfigured': config_safe['misconfigured'],
                      'environmentKeyCount': len(project_safe['env']),
                      'evidence': str(OUTPUT / 'resource-readback.json')}))


if __name__ == '__main__':
    main()
