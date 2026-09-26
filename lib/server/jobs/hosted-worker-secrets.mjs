/** Explicit hosted-worker credential source. File mode never places secrets in
 * process.env or Docker Config.Env. The operator mounts only tmpfs here. */
import {open,lstat,statfs} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';

const directory='/run/vp-worker-secrets';
const TMPFS_MAGIC=0x01021994;
const valid=value=>typeof value==='string' && /^[\x21-\x7e]{1,4096}$/.test(value);
const unavailable=()=>{throw Error('unavailable');};

async function readPrivateFile(name){
 const path=join(directory,name),filesystem=await statfs(path);
 if(filesystem.type!==TMPFS_MAGIC)unavailable();
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const info=await file.stat();
  if(!info.isFile()||info.uid!==process.getuid()||info.gid!==process.getgid()
   ||(info.mode&0o777)!==0o400||info.nlink!==1||info.size<1||info.size>4096)unavailable();
  const bytes=await file.readFile();
  try{if(bytes.length<1||bytes.length>4096)unavailable();
   const value=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
   if(!valid(value))unavailable();
   return value;
  }finally{bytes.fill(0);}
 }finally{await file.close();}
}

export async function readHostedWorkerSecrets(env){
 const mode=env.VISEPANDA_HOSTED_WORKER_SECRET_MODE;
 if(mode===undefined){
  const db=env.VISEPANDA_HOSTED_WORKER_DB_KEY,qwen=env.VISEPANDA_HOSTED_WORKER_QWEN_KEY;
  if(!valid(db)||!valid(qwen)||db===qwen)unavailable();
  delete env.VISEPANDA_HOSTED_WORKER_DB_KEY;
  delete env.VISEPANDA_HOSTED_WORKER_QWEN_KEY;
  return {workerKey:db,providerKey:qwen};
 }
 if(mode!=='files'||env.VISEPANDA_HOSTED_WORKER_DB_KEY!==undefined
  ||env.VISEPANDA_HOSTED_WORKER_QWEN_KEY!==undefined||process.platform!=='linux')unavailable();
 const info=await lstat(directory),filesystem=await statfs(directory);
 if(!info.isDirectory()||info.uid!==process.getuid()||info.gid!==process.getgid()
  ||(info.mode&0o777)!==0o700||filesystem.type!==TMPFS_MAGIC)unavailable();
 const workerKey=await readPrivateFile('db.key'),providerKey=await readPrivateFile('qwen.key');
 if(workerKey===providerKey)unavailable();
 return {workerKey,providerKey};
}
