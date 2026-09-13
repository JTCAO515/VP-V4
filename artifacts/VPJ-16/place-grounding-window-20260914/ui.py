import subprocess,os,json,sys,pathlib
ROOT=pathlib.Path(__file__).parent
ENV={**os.environ,'DEVELOPER_DIR':'/Applications/Xcode.app/Contents/Developer'}
UDID=json.loads((ROOT/'simulator.json').read_text())['udid']
AXE='/Users/jtcao/.npm/_npx/99336612077b7094/node_modules/xcodebuildmcp/bundled/axe'
def axe(args,stdin=None):
 r=subprocess.run([AXE,*args,'--udid',UDID],env=ENV,input=stdin,text=True,capture_output=True,timeout=45)
 if r.returncode: raise RuntimeError('AXe failed '+str(r.returncode))
 return r.stdout
def snapshot():
 out=[]
 def walk(n):
  if isinstance(n,list):
   for v in n:walk(v)
  elif isinstance(n,dict):
   if n.get('AXLabel') or n.get('AXUniqueId'):
    out.append({k:n.get(k) for k in ['AXUniqueId','AXLabel','type','frame','enabled']})
   walk(n.get('children',[]))
 walk(json.loads(axe(['describe-ui'])))
 return out
if __name__=='__main__':
 if sys.argv[1]=='snapshot':
  o=snapshot();print(json.dumps(o,ensure_ascii=False))
  if len(sys.argv)>2:(ROOT/(sys.argv[2]+'.json')).write_text(json.dumps(o,ensure_ascii=False,indent=2))
 elif sys.argv[1]=='tap':print(axe(['tap','--id',sys.argv[2]]))
 elif sys.argv[1]=='label':print(axe(['tap','--label',sys.argv[2],'--element-type','Button']))
 elif sys.argv[1]=='credential':
  locale,field=sys.argv[2:];assert locale in ['en','zh'] and field in ['email','password']
  users=json.loads(pathlib.Path('/Users/jtcao/Library/Caches/visepanda/s2-live-brrfsvtp/accounts.json').read_text())['users']
  u=next(u for u in users if u['locale']==locale)
  axe(['type','--stdin'],u[field]);print('Fixture '+field+' entered; content suppressed')
