import ts from 'typescript';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'../../..'),contextRoot=process.env.QA_CONTEXT_TEST_ROOT??root;
const overrides=new Map([
 [resolve(root,'lib/server/jobs/hosted-text-worker.ts'),readFileSync(join(import.meta.dirname,'after.ts.txt'),'utf8')],
 [resolve(root,'lib/server/jobs/hosted-usage-audit.ts'),readFileSync(join(import.meta.dirname,'usage-audit.after.ts.txt'),'utf8')],
]);
for(const name of readdirSync(resolve(contextRoot,'lib/server/qa-agent-context')).filter(n=>n.endsWith('.ts'))){overrides.set(resolve(root,'lib/server/qa-agent-context',name),readFileSync(resolve(contextRoot,'lib/server/qa-agent-context',name),'utf8'));}
const raw=ts.readConfigFile(resolve(root,'tsconfig.json'),ts.sys.readFile),config=ts.parseJsonConfigFileContent(raw.config,ts.sys,root);config.options.incremental=false;
const host=ts.createCompilerHost(config.options),read=host.readFile,exists=host.fileExists,dirExists=host.directoryExists;
host.directoryExists=dir=>[...overrides.keys()].some(file=>file.startsWith(resolve(dir)+"/"))||dirExists?.(dir)===true;
host.readFile=file=>overrides.get(resolve(file))??read(file);host.fileExists=file=>overrides.has(resolve(file))||exists(file);
host.getSourceFile=(file,languageVersion)=>{const source=host.readFile(file);return source===undefined?undefined:ts.createSourceFile(file,source,languageVersion,true);};
const program=ts.createProgram([...new Set([...config.fileNames,...overrides.keys()])],config.options,host),errors=ts.getPreEmitDiagnostics(program);
if(errors.length){console.error(ts.formatDiagnosticsWithColorAndContext(errors,{getCurrentDirectory:()=>root,getCanonicalFileName:x=>x,getNewLine:()=> '\n'}));process.exitCode=1;}
else console.log('Full repository TypeScript with exact shared candidates and context source: PASS');
