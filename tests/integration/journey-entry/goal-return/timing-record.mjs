import {writeFileSync,renameSync,readFileSync} from 'node:fs';
export const readTiming=path=>JSON.parse(readFileSync(path,'utf8'));
export function writeTiming(path,value){
 const temporary=path+'.tmp-'+process.pid;
 writeFileSync(temporary,JSON.stringify(value),{mode:0o600});renameSync(temporary,path);
}
