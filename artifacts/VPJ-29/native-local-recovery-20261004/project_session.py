from pathlib import Path
import re,hashlib,json
import sys
r=Path(sys.argv[1]).resolve()
output=Path(sys.argv[2]).resolve()
p=r/'ios/VisePanda/VisePanda/App/NativeSession.swift'
s=p.read_text();start=s.index('final class NativeSession {');end=s.index('\nstruct NativeDataScope:')
keep={'resolveEndpoint','tripRequest','dataRequest','restore','login','validate','logout','loadProfile','accept','ensureCurrent','handle','request','save','read','prepareDeviceMaterials','clear'}
cuts=[]
for m in re.finditer(r'^    (?:@discardableResult )?(?:private |static )?func ([A-Za-z0-9_]+)\(',s[start:end],re.M):
 if m.group(1) in keep:continue
 a=start+m.start();o=s.index('{',a);depth=1;b=o+1
 while depth:
  if s[b]=='{':depth+=1
  if s[b]=='}':depth-=1
  b+=1
 cuts.append((a,b,m.group(1)))
for a,b,_ in reversed(cuts):s=s[:a]+s[b:]
out=output/'Sources/VisePanda/NativeSession.swift';out.write_text(s)
(output/'session-projection.json').write_text(json.dumps({'source':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'keptMethods':sorted(keep),'removedUnrelatedMethods':[c[2] for c in cuts],'projection':'Unchanged Session auth/clear methods; unrelated consumer methods omitted; dependent device/other feature models are shims.'},indent=2))
