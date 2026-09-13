import importlib.util,json,pathlib,copy,sys
p=pathlib.Path(__file__).parent
s=importlib.util.spec_from_file_location('c','/Users/jtcao/Library/Caches/visepanda/s1-preview-lb66yfc6/control.py');c=importlib.util.module_from_spec(s);s.loader.exec_module(c)
c.ROOT=pathlib.Path('/Users/jtcao/Documents/VP-V4-S2-Claim-Coverage');c.WORK=p
selected=json.loads((p/'preview-state.json').read_text());host=selected['url']
mode=sys.argv[1];assert mode in ('allow','remove')
f=c.firewall();assert not f.get('draft'),'Foreign draft; no mutation'
expected=copy.deepcopy(f['active']);assert len(expected['rules'])==1
rule=expected['rules'][0];assert rule['id']=='rule_vpj_02_staging_schema_maintenance_N0pDWD' and rule['active'] and rule['action']['mitigate']['action']=='deny'
assert len(rule['conditionGroup'])==1 and len(rule['conditionGroup'][0]['conditions'])==1
cond=rule['conditionGroup'][0]['conditions'][0];assert cond['type']=='host' and cond['op']=='ninc'
if mode=='allow':
 baseline=json.loads((p/'firewall-before.json').read_text());assert c.fingerprint(f)==c.fingerprint(baseline)
 d=c.deployment(selected['id']);assert d['url']==host and d['readyState']=='READY' and d['target']!='production' and d['projectId']==c.PROJECT and d['sha']==(p/'source-sha').read_text().strip()
 assert host not in cond['value'];cond['value'].append(host)
else:
 assert (p/'firewall-allow-plan.json').exists()
 assert cond['value'].count(host)==1;cond['value'].remove(host)
prod=c.api('/v9/projects/'+c.PROJECT).get('targets',{}).get('production',{}).get('id')
c.save('firewall-'+mode+'-plan.json',{'beforeFingerprint':c.fingerprint(f),'expected':expected,'productionTarget':prod})
assert c.fingerprint(c.firewall())==c.fingerprint(f)
c.cli(['firewall','rules','edit',rule['id'],'--condition',json.dumps(cond),'--action','deny','--yes','--project',c.PROJECT,'--scope','jtcao515s-projects'])
staged=c.firewall();c.save('firewall-'+mode+'-staged.json',staged)
compare=['ownerId','projectKey','ips','firewallEnabled','crs','rules']
def match(config):return config.get('projectKey') in (c.PROJECT+'#active',c.PROJECT+'#draft') and all(config.get(k)==expected.get(k) for k in compare if k!='projectKey')
if staged.get('draft'):
 assert staged['active']==f['active'] and match(staged['draft'])
 version=staged['draft']['version'];assert isinstance(version,int) and version>f['active']['version']
 assert c.fingerprint(c.firewall())==c.fingerprint(staged)
 c.cli(['firewall','publish','--yes','--project',c.PROJECT,'--scope','jtcao515s-projects'])
else:
 assert match(staged['active']);version=staged['active']['version']
after=c.firewall();c.save('firewall-'+mode+'-after.json',after)
assert not after.get('draft') and after['active']['version']==version and match(after['active'])
assert c.api('/v9/projects/'+c.PROJECT).get('targets',{}).get('production',{}).get('id')==prod
print(json.dumps({'mode':mode,'activeVersion':version,'onlyOwnHostChanged':True,'productionTargetUnchanged':True}))
