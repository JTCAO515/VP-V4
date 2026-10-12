import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {loopbackDockerArgv} from './docker-argv.mjs';
import {nonce,owner} from './scope.mjs';
import {dirname,basename,resolve} from 'node:path';
import {classifyReject,writeReject} from './reject-observation.mjs';
import {validateAuthBootstrap,admitAuthBootstrap} from './auth-bootstrap.mjs';
let recordDirectory;
try{
 const path=resolve(process.env.VPJ13_E3_DOCKER_ADAPTER_CONFIG);if(basename(path)!=='adapter-config.json')throw Error('E3_DOCKER_CONFIG');
 const config=JSON.parse(readFileSync(path,'utf8'));
 if(config.nonce!==nonce||config.owner!==owner||typeof config.officialDocker!=='string'||!config.officialDocker.startsWith('/'))throw Error('E3_DOCKER_CONFIG');
 recordDirectory=dirname(path);
 const args=process.argv.slice(2);let transformed;
 if(args[0]==='run'&&config.authBootstrap===true){
  validateAuthBootstrap(args,process.env,'postgres'); // original CLI's unchanged fresh local DB password
  admitAuthBootstrap(recordDirectory);transformed={args};
 }else transformed=loopbackDockerArgv(args);
 // Neither argv nor environment are logged. Original Docker receives identical
 // stdin/stdout/stderr and every unchanged argument; only publishing tightens.
 const result=spawnSync(config.officialDocker,transformed.args,{stdio:'inherit',env:process.env});
 if(result.error)throw Error('E3_DOCKER_LAUNCH_FAILED');process.exitCode=result.status??1;
}catch(error){
 const record=classifyReject(process.argv.slice(2),error);if(recordDirectory)try{writeReject(recordDirectory,record);}catch{/* Observation unavailable; no fallback path. */}
 const code='E3_DOCKER_'+record.reason;
 process.stderr.write(code+'\n');process.exitCode=126;
}
