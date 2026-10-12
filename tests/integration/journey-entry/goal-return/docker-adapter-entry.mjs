import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {loopbackDockerArgv} from './docker-argv.mjs';
import {nonce,owner} from './scope.mjs';
try{
 const config=JSON.parse(readFileSync(process.env.VPJ13_E3_DOCKER_ADAPTER_CONFIG,'utf8'));
 if(config.nonce!==nonce||config.owner!==owner||typeof config.officialDocker!=='string'||!config.officialDocker.startsWith('/'))throw Error('E3_DOCKER_CONFIG');
 const transformed=loopbackDockerArgv(process.argv.slice(2));
 // Neither argv nor environment are logged. Original Docker receives identical
 // stdin/stdout/stderr and every unchanged argument; only publishing tightens.
 const result=spawnSync(config.officialDocker,transformed.args,{stdio:'inherit',env:process.env});
 if(result.error)throw Error('E3_DOCKER_LAUNCH_FAILED');process.exitCode=result.status??1;
}catch(error){
 const code=error instanceof Error&&/^E3_DOCKER_[A-Z_]+$/.test(error.message)?error.message:'E3_DOCKER_ADAPTER_UNAVAILABLE';
 process.stderr.write(code+'\n');process.exitCode=126;
}
