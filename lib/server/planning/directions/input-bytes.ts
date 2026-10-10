/** Exact UTF-8 JSON text, retaining whitespace/key order/number lexemes.
 * Invalid UTF-8 and BOM-prefixed JSON fail rather than changing operation bytes. */
export async function directionsInputBytes(request:Request,run:<T>(work:()=>PromiseLike<T>)=>Promise<T>):Promise<string|null>{
 const reader=request.body?.getReader();if(!reader)return null;
 const chunks:Uint8Array[]=[];let size=0;
 try{
  for(;;){const next=await run(()=>reader.read());if(next.done)break;size+=next.value.byteLength;if(size>16384)return null;chunks.push(next.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);JSON.parse(text);return text;}catch{return null;}
 }finally{try{void reader.cancel().catch(()=>{});}catch{}try{reader.releaseLock();}catch{}}
}
