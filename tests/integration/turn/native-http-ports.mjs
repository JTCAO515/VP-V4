import net from 'node:net';

export const DEFAULT_NATIVE_HTTP_BASE = 59620;
export const NATIVE_HTTP_OFFSETS = Object.freeze([20,21,22,23,24,27,29,31]);
const modes = new Set(['--service','--grounded','--grounded-native','--assistant-native','--assistant-rollback','--planning','--translation-history']);

export function nativeHTTPPorts(value = DEFAULT_NATIVE_HTTP_BASE) {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d{4,5}$/.test(String(value))) throw Error('Invalid disposable port base');
  const base = Number(value);
  if (!Number.isInteger(base) || base < 1024 || base > 65000) throw Error('Invalid disposable port base');
  return Object.freeze({base, supabaseAPI:`http://127.0.0.1:${base+21}`, apiPort:base+31,
    api:`http://127.0.0.1:${base+31}`, ports:Object.freeze(NATIVE_HTTP_OFFSETS.map(offset=>base+offset))});
}

export function nativeHTTPOptions(args, env = {}) {
  let mode, explicit;
  for (let i=0;i<args.length;i++) {
    if (args[i]==='--port-base' && explicit===undefined && args[i+1]!==undefined) explicit=args[++i];
    else if (modes.has(args[i]) && mode===undefined) mode=args[i];
    else throw Error('Unknown or duplicate native HTTP test option');
  }
  if (explicit!==undefined && env.VP_NATIVE_HTTP_PORT_BASE!==undefined && explicit!==env.VP_NATIVE_HTTP_PORT_BASE) throw Error('Conflicting disposable port bases');
  return {mode, ports:nativeHTTPPorts(explicit ?? env.VP_NATIVE_HTTP_PORT_BASE ?? DEFAULT_NATIVE_HTTP_BASE)};
}

export function nativeHTTPChildEnv(ports, workdir) {
  return {VP_NATIVE_HTTP_PORT_BASE:String(ports.base),VP_NATIVE_API_PORT:String(ports.apiPort),
    VP_IDENTITY_SUPABASE_WORKDIR:workdir,VP_IDENTITY_SUPABASE_API_URL:ports.supabaseAPI};
}

// Validate the port contract before status discovery, fixture SQL or any process launch.
export function nativeHTTPEnvironmentPorts(env) {
  const ports=nativeHTTPPorts(env.VP_NATIVE_HTTP_PORT_BASE ?? DEFAULT_NATIVE_HTTP_BASE);
  if (env.VP_IDENTITY_SUPABASE_API_URL!==ports.supabaseAPI
    || (env.VP_NATIVE_API_PORT!==undefined && env.VP_NATIVE_API_PORT!==String(ports.apiPort))) throw Error('Disposable native HTTP port contract mismatch');
  return ports;
}

export function nativeHTTPSupabaseConfig(source, project, ports) {
  if (!/^vp-native-ask-[a-f0-9]{8}$/.test(project)) throw Error('Invalid disposable native HTTP namespace');
  if (!/^project_id\s*=.*$/m.test(source)) throw Error('Disposable project configuration missing');
  // One replacement pass: a selected base can overlap the original default range.
  const mapping=new Map(NATIVE_HTTP_OFFSETS.filter(offset=>offset!==31).map(offset=>[String(54300+offset),String(ports.base+offset)]));
  for (const original of mapping.keys()) if (!new RegExp(`\\b${original}\\b`).test(source)) throw Error('Disposable Supabase port configuration changed');
  return source.replace(/^project_id\s*=.*$/m,`project_id = "${project}"`)
    .replace(/\b(?:54320|54321|54322|54323|54324|54327|54329)\b/g,port=>mapping.get(port))
    .replace(/(\[db.seed\][\s\S]*?enabled = )true/,'$1false');
}

export async function assertNativeHTTPPortsFree(ports) {
  for (const port of ports.ports) await new Promise((ok,fail)=>{
    const socket=net.createServer();
    socket.once('error',()=>fail(Error(`Disposable test port unavailable: 127.0.0.1:${port}`)));
    socket.listen(port,'127.0.0.1',()=>socket.close(ok));
  });
}
