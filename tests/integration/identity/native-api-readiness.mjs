/** Read-only startup probe. Never create accounts or retry a mutation to warm up the API. */
export async function waitForNativeAPI(api, server) {
  const target=new URL(api);
  if(target.protocol!=='http:' || !['127.0.0.1','localhost'].includes(target.hostname)) throw new Error('Native test API must be explicit loopback');
  const deadline=Date.now()+60000;
  let observed='no response';
  while(Date.now()<deadline) {
    if(server && server.exitCode!==null) throw new Error('Owned native API process exited before readiness');
    try {
      const result=await fetch(api+'/api/auth/native/v2/session',{credentials:'omit',signal:AbortSignal.timeout(5000)});
      observed='HTTP '+result.status;
      if(result.status===401 && result.headers.get('content-type')?.includes('application/json')) {
        const body=await result.json();
        if(body.error?.code==='UNAUTHENTICATED') {
          if(server && server.exitCode!==null) throw new Error('Owned native API exited during readiness');
          return;
        }
      }
    } catch { /* Only the harmless startup probe retries; no credential/body is logged. */ }
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error('Native API readiness failed: expected 401 JSON UNAUTHENTICATED; observed '+observed);
}
