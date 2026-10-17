"""Compare captured catalog metadata, never application rows or function bodies."""
import collections,json,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
def read(name):return json.loads((HERE/name).read_text())
def normalize(v,key=None):
 if isinstance(v,dict):return {k:normalize(x,k) for k,x in v.items()}
 if isinstance(v,list):
  out=[normalize(x) for x in v]
  return sorted(out,key=lambda x:json.dumps(x,sort_keys=True)) if key in ('acl','roles') else out
 return v
local={o['name']:normalize(o) for o in read('d0-local-catalog.json')['objects']}
target={o['name']:normalize(o) for o in read('d0-target-catalog.json')['objects']}
results=[]
for name,l in sorted(local.items()):
 r=target[name];ld=l['definitions'];rd=r['definitions'];item={'name':name,'kind':l['kind']}
 if name.startswith('auth.'):
  item.update(classification='UNKNOWN',reason='Managed Auth is not equivalent to synthetic platform shims; retain managed objects.',targetExists=rd is not None)
 elif rd is None:item.update(classification='absent',reason='No matching namespace/name in target catalog snapshot.')
 elif ld==rd:item.update(classification='reuse-exact',reason='Equal captured metadata only; excludes row compatibility, effective inherited privileges and runtime behavior.')
 else:
  keys=sorted({k for v in ld+rd for k in v if [x.get(k) for x in ld]!=[x.get(k) for x in rd]})
  item.update(classification='different-owner-or-shape',differentFields=keys,reason='Difference is not a defect finding or overwrite authorization.')
  if l['kind']=='table' and len(ld)==len(rd)==1:
   item['namedDifferences']={}
   for key in ('columns','constraints','policies','triggers','indexes'):
    if key not in keys:continue
    a={x['name']:x for x in ld[0][key] or []};b={x['name']:x for x in rd[0][key] or []}
    item['namedDifferences'][key]={'localOnly':sorted(a.keys()-b.keys()),'targetOnly':sorted(b.keys()-a.keys()),'changed':sorted(x for x in a.keys()&b.keys() if a[x]!=b[x])}
 results.append(item)
counts=dict(collections.Counter(x['classification'] for x in results))
ports=json.loads(subprocess.check_output(['git','show','7f0352ac99affbb00c67e77ca1ff1b7196b769af:scripts/qa-agent-db-baseline/port-coverage.json'],cwd=HERE))['ports']
portResults=[{'name':p['name'],'classification':next(x['classification'] for x in results if x['name']=='public.'+p['name'])} for p in ports]
report={'source':'7f0352ac99affbb00c67e77ca1ff1b7196b769af','project':'dzqdzetcctkhbrhlxxgn','status':'PASS_BOUNDED_CATALOG_COMPARISON','counts':counts,'applicationObjects':77,'managedAuthDependencies':5,'catalogColumnsOnly':True,'ledgerRows':len(read('d0-ledger.json')),'objects':results,'ports':portResults,'limitations':['reuse-exact means only equality of fields in d0-catalog.sql, not whole-database equivalence','No row data, function bodies, policy expressions or default expressions captured','Schema ACL, inherited roles, dependency closure outside allowlist, concurrent change detection and migration compatibility are not established','Managed Auth/JWT, provider, worker activation, real service, device, deletion preservation, rollback and target apply remain UNRUN','Target snapshot and migration ledger are separate read-only transactions; re-pin immediately before any future authorized apply']}
(HERE/'d0-comparison.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'counts':counts,'ports':dict(collections.Counter(x['classification'] for x in portResults))}))
