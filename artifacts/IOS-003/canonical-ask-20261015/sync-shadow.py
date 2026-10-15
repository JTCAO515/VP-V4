from pathlib import Path
import subprocess,shutil,hashlib,json
root=Path.cwd();metadata=Path('artifacts/IOS-003/canonical-ask-20261015/shadow-run.json');v=json.loads(metadata.read_text());shadow=Path(v['shadow'])
changed=subprocess.check_output(['git','diff','--name-only','HEAD'],text=True).splitlines()
new=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],text=True).splitlines()
files=sorted(set(changed+new+v['workingSourceFilesCopied']))
for relative in files:
 src=root/relative
 if src.is_file():
  dst=shadow/relative;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dst)
mode=Path('ios/VisePanda/VisePanda/Features/Ask/NativeAskModels.swift')
assert hashlib.sha256((root/mode).read_bytes()).hexdigest()==v['modelsOriginalSHA256']
assert hashlib.sha256((shadow/mode).read_bytes()).hexdigest()==v['modelsCandidateSHA256']
v['workingSourceFilesCopied']=files
v['sourceSHA256']={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files if (root/p).is_file()}
metadata.write_text(json.dumps(v,indent=2)+'\n');print('Shadow synchronized; product Models remains original, candidate-only Models hash unchanged')
