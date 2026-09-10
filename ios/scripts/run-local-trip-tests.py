from pathlib import Path
import plistlib,json,os,subprocess,time,sys,hashlib,argparse
parser=argparse.ArgumentParser(description="Run explicit local synthetic iOS Trip checks without starting services or retaining credentials.")
parser.add_argument("--credentials",type=Path,required=True)
parser.add_argument("--derived-data",type=Path,required=True)
parser.add_argument("--mode",choices=["integration","ui","web"],required=True)
parser.add_argument("--locale",choices=["en","zh-Hans"],default="en")
parser.add_argument("--size",choices=["large","accessibility-extra-extra-extra-large"],default="large")
parser.add_argument("--simulator",choices=["B8B7B17F-A447-487E-B52C-31A303CF713A","152CB87B-089B-4FD4-BC7D-64ED4A621874"],required=True)
parser.add_argument("--web-expectation",type=Path)
args=parser.parse_args()
root=Path(__file__).resolve().parents[2]
cache=Path.home()/"Library/Caches/visepanda/local-trip-ios"
cache.mkdir(parents=True,exist_ok=True)
products=args.derived_data.resolve()/"Build/Products"
config=json.loads(args.credentials.read_text())
if config.get("apiURL")!="http://127.0.0.1:59931":raise SystemExit("Only the explicitly scoped local Trip API is supported")
mode=args.mode;locale=args.locale;size=args.size;sim=args.simulator
env={'DEVELOPER_DIR':'/Applications/Xcode.app/Contents/Developer','PATH':'/Applications/Xcode.app/Contents/Developer/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin','HOME':str(Path.home()),'TMPDIR':os.environ.get('TMPDIR','/tmp'),'LANG':'en_US.UTF-8'}
run=cache/time.strftime('%Y%m%d-%H%M%S');run.mkdir()
source=next(products.glob('*.xctestrun'))
d=plistlib.loads(source.read_bytes())
def resolve(v):
 if isinstance(v,str):return v.replace('__TESTROOT__',str(products))
 if isinstance(v,list):return [resolve(x) for x in v]
 if isinstance(v,dict):return {k:resolve(x) for k,x in v.items()}
 return v
d=resolve(d)
values={'VP_NATIVE_TRIP_TEST':'1','VP_NATIVE_TRIP_EMAIL':config['email'],'VP_NATIVE_TRIP_PASSWORD':config['password'],'VP_NATIVE_TRIP_LOCALE':locale}
if mode=='web':
 if args.web_expectation is None:raise SystemExit("--web-expectation is required for browser reciprocity")
 values.update(json.loads(args.web_expectation.read_text()))
for name in ['VisePandaTests','VisePandaUITests']:d[name].setdefault('EnvironmentVariables',{}).update(values)
private=run/'runtime.xctestrun'
try:
 with os.fdopen(os.open(private,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'wb') as f:plistlib.dump(d,f)
 methods={'integration':'VisePandaTests/NativeTripIntegrationTests/testRealLocalCreateConfirmReloadConflictAndReplacedSession','ui':'VisePandaUITests/NativeTripUITests/testRealLocalTripDraftReviewConfirmAndRelaunch','web':'VisePandaUITests/NativeTripUITests/testReloadSameTripAfterWebConfirmation'}
 cmd=['/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild','test-without-building','-xctestrun',str(private),'-destination','platform=iOS Simulator,id='+sim,'-parallel-testing-enabled','NO','-only-testing:'+methods[mode],'-resultBundlePath',str(run/'result.xcresult')]
 source_hashes={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/'ios').rglob('*.swift'))}
 app_binary=products/'Debug-iphonesimulator/VisePanda.app/VisePanda'
 binary_hash=hashlib.sha256(app_binary.read_bytes()).hexdigest()
 app_code_hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [app_binary,*sorted(app_binary.parent.glob("*.dylib"))]}
 print(str(run),flush=True)
 start=time.time()
 setcmd=['/Applications/Xcode.app/Contents/Developer/usr/bin/simctl','ui',sim,'content_size',size]
 setting=subprocess.run(setcmd,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 assert setting.returncode==0,setting.stderr
 actual=subprocess.check_output(setcmd[:-1],env=env,text=True).strip();assert actual==size,(size,actual)
 with (run/'xcodebuild.log').open('w') as f:r=subprocess.run(cmd,cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT)
 record={'command':cmd,'cwd':str(root),'environment':{'DEVELOPER_DIR':env['DEVELOPER_DIR']},'mode':mode,'locale':locale,'systemContentSize':actual,'exitCode':r.returncode,'elapsedSeconds':round(time.time()-start,2),'log':str(run/'xcodebuild.log'),'resultBundle':str(run/'result.xcresult'),'credentialHandling':'Explicit protected local credentials file injected into mode0600 transient xctestrun, removed after run; values excluded from evidence.','sourceSHA256':source_hashes,'appBinarySHA256':binary_hash,'appCodeSHA256':app_code_hashes}
 if mode=="web":record["webExpectation"]={k:v for k,v in values.items() if k in ["VP_NATIVE_TRIP_SHARED_ID","VP_NATIVE_TRIP_WEB_TITLE","VP_NATIVE_TRIP_WEB_ITEM_TITLE","VP_NATIVE_TRIP_WEB_DAY","VP_NATIVE_TRIP_WEB_VERSION"]}
 out=root/'artifacts/VPJ-05/ios';out.mkdir(parents=True,exist_ok=True)
 with (out/'commands.jsonl').open('a') as f:f.write(json.dumps(record)+'\n')
 print(json.dumps({k:record[k] for k in ['mode','locale','systemContentSize','exitCode','elapsedSeconds','resultBundle']}),flush=True)
finally:
 private.unlink(missing_ok=True)
 log_path=run/"xcodebuild.log"
 if log_path.exists():
  log_path.write_text(log_path.read_text().replace(config["password"],"[redacted local test credential]"))
sys.exit(r.returncode)
