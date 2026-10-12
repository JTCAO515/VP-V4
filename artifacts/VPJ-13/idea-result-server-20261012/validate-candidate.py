from pathlib import Path
import re,subprocess
root=Path.cwd();out=root/'artifacts/VPJ-13/idea-result-server-20261012'
worker=Path('/private/tmp/vpj13-idea-result-worker-check-2c8136.ts');tests=Path('/private/tmp/vpj13-idea-result-worker-tests-2c8136.ts')
s=(out/'shared-candidates/planning-v2-bounded-worker.after.ts.txt').read_text()
s=re.sub(r"from '(\.[^']+)'",lambda m:"from '"+str((root/'lib/server/turn'/m[1]).resolve())+"'",s);worker.write_text(s)
args=['node','node_modules/typescript/bin/tsc','--noEmit','--strict','--target','es2017','--lib','esnext,dom,dom.iterable','--module','esnext','--moduleResolution','bundler','--allowImportingTsExtensions','--skipLibCheck','--esModuleInterop','--typeRoots',str(root/'node_modules/@types'),str(worker)]
with (out/'candidate-typecheck-r2.log').open('w') as log:subprocess.run(args,stdout=log,stderr=subprocess.STDOUT,check=True)
s=(root/'tests/contract/turn/planning-v2-bounded-worker.test.ts').read_text()
s=re.sub(r"from '([^']+)'",lambda m:"from '"+(str(worker) if m[1].endswith('/planning-v2-bounded-worker.ts') else str((root/'tests/contract/turn'/m[1]).resolve()) if m[1].startswith('.') else m[1])+"'",s)
s="import {projectQualifiedIntakeComparison} from '"+str(root/'lib/server/artifacts/qualified-intake-comparison.ts')+"';\n"+s
s=re.sub(r"case 'project_planning_intake_comparison_v1':return .*?;\n","case 'project_planning_intake_comparison_v1':return projectQualifiedIntakeComparison(qualified,{...lease.source,contextDigest:lease.intakeContextDigest},place,lease.locale,Date.now(),lease.environment);\n",s);tests.write_text(s)
with (out/'candidate-behavior.log').open('w') as log:subprocess.run(['node','--test','--test-name-pattern','full mocked|lost output|unknown tool|caller reservation',str(tests)],stdout=log,stderr=subprocess.STDOUT,check=True)
print('Candidate strict typecheck and 4 existing mocked-worker behavioral tests passed; shared source untouched.')
