/** Bounded, output-only observer. Never forwards raw server output or changes
 * fetch/request environment; only fixed categories and safe relative frames. */
export function createSafeServerDiagnostic(emit,now=()=>Date.now()){
 const buffers=new Map(),chains=new Map();let next=0,records=0;
 const record=(stream,event)=>{if(records++<96)emit({at:new Date(now()).toISOString(),stream,...event});};
 const parse=(stream,line)=>{
  const error=/\b(TypeError|SyntaxError|AggregateError|InvariantError|Error):/.exec(line);
  if(error){if(!/\[cause\]/.test(line))chains.set(stream,++next);record(stream,{chain:chains.get(stream)??0,cause:/\[cause\]/.test(line),name:error[1],category:/failed to pipe response/i.test(line)?'response_pipe':/controller.*closed|invalid state|stream/i.test(line)?'response_stream':/body.*locked|body.*consum|body.*disturb/i.test(line)?'response_body':/cookie/i.test(line)?'cookie':/header/i.test(line)?'header':/cannot read propert|undefined/i.test(line)?'undefined_property':/invariant/i.test(line)?'invariant':/timeout|timed out/i.test(line)?'timeout':'other'});}
  const code=/\b(ERR_INVALID_STATE|ERR_HTTP_HEADERS_SENT|ERR_STREAM_PREMATURE_CLOSE|ECONNRESET|ETIMEDOUT)\b/.exec(line);if(code)record(stream,{chain:chains.get(stream)??0,code:code[1]});
  const frame=/(?:node_modules\/(?:next|react|@supabase)|lib\/server|app\/api|\.next\/dev)\/[A-Za-z0-9_./\[\]@-]+:[0-9]+:[0-9]+/.exec(line);if(frame)record(stream,{chain:chains.get(stream)??0,frame:frame[0]});
  const request=/\b(GET|POST) \/api\/trips\/[0-9a-f-]{36}\/(proposal|confirm)(?:[^\s]*)? ([1-5][0-9]{2})\b/.exec(line);if(request)record(stream,{endpoint:request[2],method:request[1],status:Number(request[3])});
  if(/compil(?:ed|ing)/i.test(line))record(stream,{buildEvent:'compile'});
 };
 return {write(stream,chunk){const pending=(buffers.get(stream)??'')+String(chunk);const bounded=pending.slice(-16384);const lines=bounded.split('\n');buffers.set(stream,lines.pop().slice(-4096));for(const line of lines)parse(stream,line.slice(0,4096));},end(stream){const line=buffers.get(stream);if(line)parse(stream,line);buffers.delete(stream);},get retainedCharacters(){return [...buffers.values()].reduce((a,b)=>a+b.length,0);}};
}
