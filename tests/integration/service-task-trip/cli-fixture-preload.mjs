// Test-only closed transport: real CLI/factory → owned local SQL fixture broker.
const originalFetch=globalThis.fetch;
const broker=process.env.VP_TRIP_FIXTURE_IPC;
if(!broker||!/^http:\/\/127\.0\.0\.1:[0-9]+\/fixture$/.test(broker))throw Error('Owned fixture broker required');
globalThis.fetch=async(input,options)=>{
 const url=String(input);
 if(!url.startsWith('https://dzqdzetcctkhbrhlxxgn.supabase.co/rest/v1/rpc/')&&url!=='https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions')throw Error('External fixture destination denied');
 return originalFetch(broker,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url,body:options?.body}),signal:options?.signal});
};
