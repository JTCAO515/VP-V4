/** Reject duplicate decoded property names before JSON.parse loses them.
 * The bounded envelope limits bytes; depth is bounded here as well. */
export function parseControlJson(text:string):unknown{
 const parsed:unknown=JSON.parse(text);let i=0;
 const ws=()=>{while(i<text.length&&/\s/.test(text[i]))i++;};
 const string=():string=>{
  const start=i++;for(;i<text.length;i++){
   if(text[i]==='\\'){i++;continue;}
   if(text[i]==='"'){i++;return JSON.parse(text.slice(start,i)) as string;}
  }throw Error('INVALID_INPUT');
 };
 const value=(depth:number):void=>{
  if(depth>16)throw Error('INVALID_INPUT');ws();
  if(text[i]==='"'){string();return;}
  if(text[i]==='{'){
   i++;ws();const names=new Set<string>();if(text[i]==='}'){i++;return;}
   for(;;){ws();const name=string();if(names.has(name))throw Error('INVALID_INPUT');names.add(name);ws();i++;value(depth+1);ws();if(text[i]==='}'){i++;return;}i++;}
  }
  if(text[i]==='['){i++;ws();if(text[i]===']'){i++;return;}for(;;){value(depth+1);ws();if(text[i]===']'){i++;return;}i++;}}
  while(i<text.length&&!/[\s,}\]]/.test(text[i]))i++;
 };
 value(0);ws();if(i!==text.length)throw Error('INVALID_INPUT');return parsed;
}
