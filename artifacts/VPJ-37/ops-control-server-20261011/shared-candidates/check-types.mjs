import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';
const root=process.cwd(),directory=path.join(root,'artifacts/VPJ-37/ops-control-server-20261011/shared-candidates');
const pins=JSON.parse(fs.readFileSync(path.join(directory,'pins.json'),'utf8'));const overlay=new Map();
for(const entry of pins.files)if(/\.(ts|tsx)$/.test(entry.path))overlay.set(path.join(root,entry.path),fs.readFileSync(path.join(directory,'sources',entry.path+'.after.txt'),'utf8'));
const config=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile);if(config.error)throw Error('Config unavailable');
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);const options={...parsed.options,incremental:false,noEmit:true};
const host=ts.createCompilerHost(options),read=host.readFile.bind(host);host.readFile=file=>overlay.get(path.resolve(file))??read(file);
const program=ts.createProgram(parsed.fileNames,options,host);const diagnostics=ts.getPreEmitDiagnostics(program);
if(diagnostics.length){console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:s=>s,getNewLine:()=> '\n'}));process.exitCode=1;}
else console.log(`Candidate overlay typecheck PASS (${overlay.size} TS/TSX after files; no shared apply)`);
