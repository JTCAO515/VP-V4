/** Private preparation only: does not install/change any configuration. */
export function goalReturnTemporaryConfig(source){
 if(typeof source!=='string')throw Error('E3_CONFIG_TYPE');
 const seen={realtime:0,storage:0,auth:0},enabled={realtime:0,storage:0,auth:0};let section='';
 const result=source.split(/(?<=\n)/).map(line=>{
  const table=/^[ \t]*\[([^\]\r\n]+)\][ \t]*(?:#[^\r\n]*)?(?:\r?\n)?$/.exec(line);
  if(table){section=table[1];if(Object.hasOwn(seen,section)&&++seen[section]!==1)throw Error('E3_CONFIG_DUPLICATE_TABLE');return line;}
  if(!Object.hasOwn(seen,section)||!/^\s*enabled\s*=/.test(line))return line;
  if(++enabled[section]!==1)throw Error('E3_CONFIG_DUPLICATE_ENABLED');
  const flag=/^([ \t]*enabled[ \t]*=[ \t]*)true([ \t]*(?:#[^\r\n]*)?)(\r?\n)?$/.exec(line);
  if(!flag)throw Error('E3_CONFIG_EXPECTED_TRUE');
  return section==='auth'?line:flag[1]+'false'+flag[2]+(flag[3]??'');
 }).join('');
 if(Object.values(seen).some(n=>n!==1)||Object.values(enabled).some(n=>n!==1))throw Error('E3_CONFIG_MISSING_AUTHORITY');
 return result;
}
