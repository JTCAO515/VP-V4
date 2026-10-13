#!/usr/bin/env python3
"""Read known public pages/assets; emit Supabase refs only, never bundle contents/keys."""
import concurrent.futures
import datetime
import html.parser
import json
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

PROJECT = 'prj_XwsjEc8YnYNeDVAqBrcdmbJXEqA2'
TEAM = 'team_vLT8SL2mQJJSnXbD9GzVLP4K'
HOSTS = ('go2china.space', 'www.go2china.space', 'testing.go2china.space',
         'vp-v4.vercel.app', 'qatesting.go2china.space', 'staging.go2china.space')
REF = re.compile(rb'(?<![a-z0-9])([a-z0-9]{10,40})\.supabase\.co')

class Scripts(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(); self.paths = set()
    def handle_starttag(self, tag, attrs):
        if tag != 'script': return
        src = dict(attrs).get('src')
        if src: self.paths.add(src)

def fetch(url, allowed_host, limit):
    class ScopedRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            u = urllib.parse.urlsplit(newurl)
            if u.scheme != 'https' or u.hostname != allowed_host or u.username or u.password:
                raise urllib.error.HTTPError(url, code, 'outside known origin', headers, fp)
            return super().redirect_request(req, fp, code, msg, headers, newurl)
    opener = urllib.request.build_opener(ScopedRedirect)
    try:
        r = opener.open(urllib.request.Request(url, headers={'User-Agent':'QA-public-binding-metadata/1'}), timeout=15)
        body = r.read(limit + 1)
        if len(body) > limit: return {'status':'bounded-size-refusal'}, b''
        state = {'status':r.status, 'refs':sorted({x.decode() for x in REF.findall(body)})}
        r.close(); return state, body
    except urllib.error.HTTPError as error:
        return {'status':error.code}, b''
    except Exception:
        return {'status':'network-unknown'}, b''

def probe(host):
    origin='https://'+host; pages=[]; assets=set(); findings=[]
    for path in ('/', '/auth/sign-in?returnTo=%2Fqa'):
        state, body=fetch(origin+path, host, 1_000_000)
        pages.append({'path':path, **state})
        if state.get('status')!=200: continue
        parser=Scripts(); parser.feed(body.decode('utf-8',errors='ignore'))
        for src in parser.paths:
            u=urllib.parse.urlsplit(urllib.parse.urljoin(origin,src))
            if u.scheme=='https' and u.hostname==host and u.path.startswith('/_next/static/') and u.path.endswith('.js') and not u.username and not u.password:
                query=urllib.parse.parse_qsl(u.query,keep_blank_values=True)
                if query and not (len(query)==1 and query[0][0]=='dpl' and re.fullmatch(r'dpl_[A-Za-z0-9]{10,60}',query[0][1])):
                    continue
                assets.add(u.path+('?' + u.query if u.query else ''))
    # Known HTML-linked assets only; no guessed chunks or external source requests.
    paths=sorted(assets)
    if len(paths)>30: paths=paths[:30]
    for path in paths:
        state, _=fetch(origin+path,host,2_500_000)
        if state.get('refs'):findings.append({'publicAssetPath':urllib.parse.urlsplit(path).path,'status':state['status'],'supabaseRefs':state['refs']})
    refs=sorted({r for p in pages for r in p.get('refs',[])}|{r for f in findings for r in f['supabaseRefs']})
    return {'host':host,'pages':pages,'htmlLinkedAssetCount':len(assets),'assetsChecked':len(paths),
            'supabaseRefs':refs,'evidence':findings,'bindingKind':'public browser build-time configuration; server/runtime binding not attested',
            'result':'OBSERVED' if refs else 'UNKNOWN'}

def api(path):
    p=subprocess.run(['vercel','api',path,'--method','GET','--raw'],capture_output=True,text=True,timeout=30)
    if p.returncode:return None
    if len(p.stdout)>2_000_000:return None
    return json.loads(p.stdout)

def main():
    domains=api('/v9/projects/'+PROJECT+'/domains?teamId='+TEAM+'&limit=100')
    if not domains:raise SystemExit('Known project domain metadata unavailable; no alternate identity')
    domain_rows=[{k:d.get(k) for k in ('name','projectId','gitBranch','verified')} for d in domains.get('domains',[]) if d.get('name') in HOSTS]
    if len(domain_rows)!=len(HOSTS) or any(x['projectId']!=PROJECT for x in domain_rows):raise SystemExit('Known host ownership mismatch')
    metadata=[]
    for host in HOSTS:
        alias=api('/v4/aliases/'+host+'?projectId='+PROJECT+'&teamId='+TEAM)
        item={'host':host,'aliasMetadata':'UNKNOWN'}
        if alias:
            owner=alias.get('projectId')
            dep=alias.get('deployment') or {}; dep_id=dep.get('id')
            if owner not in (None,PROJECT):raise SystemExit('Alias project mismatch')
            if dep_id:
                d=api('/v13/deployments/'+dep_id+'?teamId='+TEAM+'&withGitRepoInfo=true')
                if d and d.get('projectId')==PROJECT:
                    item.update({'aliasMetadata':'OBSERVED','deploymentId':d.get('id'),'deploymentHost':d.get('url'),
                        'target':d.get('target'),'readyState':d.get('readyState'),
                        'gitSha':(d.get('meta') or {}).get('githubCommitSha'),'gitBranch':(d.get('meta') or {}).get('githubCommitRef')})
        metadata.append(item)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        observations=list(pool.map(probe,HOSTS))
    result={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'projectId':PROJECT,'teamId':TEAM,
        'domains':domain_rows,'deploymentMetadata':metadata,'publicObservations':observations,
        'keyJwtCookieExtractedOrOutput':False,'bundleBodyPersisted':False,'environmentSecretGetterUsed':False,'writes':False,
        'developmentEnvironmentRef':'UNKNOWN: no per-URL safe environment lookup performed',
        'nativeInstalledRuntime':'UNKNOWN: no device evidence','hostNode22':'UNKNOWN: JT host metadata not checked here'}
    output=Path(__file__).resolve().parents[2]/'artifacts/QAWEB/deployment-20261013/current-public-bindings.json'
    output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'projectId':PROJECT,'bindings':[{'host':x['host'],'refs':x['supabaseRefs'],'result':x['result']} for x in observations],
        'deployments':metadata,'evidence':str(output)},indent=2))

if __name__=='__main__':main()
