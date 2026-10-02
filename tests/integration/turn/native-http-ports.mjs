import net from 'node:net';
import {readFileSync} from 'node:fs';

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

// Read-only, port-scoped kernel state. No PID, command line, remote address or row
// contents are returned; this is an observation, never an ownership/root-cause claim.
export function nativeHTTPPortObservation(port, {platform=process.platform, read=readFileSync}={}) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid observed disposable port');
  const result={source:platform==='linux'?'linux-proc':'unavailable',tcpTablesRead:0,
    ephemeralRange:null,inEphemeralRange:null,tcpStates:{}};
  if (platform!=='linux') return result;
  const names={'01':'ESTABLISHED','02':'SYN_SENT','03':'SYN_RECV','04':'FIN_WAIT1','05':'FIN_WAIT2',
    '06':'TIME_WAIT','07':'CLOSE','08':'CLOSE_WAIT','09':'LAST_ACK','0A':'LISTEN','0B':'CLOSING','0C':'NEW_SYN_RECV'};
  try {
    const range=read('/proc/sys/net/ipv4/ip_local_port_range','utf8').trim().split(/\s+/).map(Number);
    if (range.length===2 && range.every(n=>Number.isInteger(n)&&n>=1024&&n<=65535) && range[0]<=range[1]) {
      result.ephemeralRange=range;result.inEphemeralRange=port>=range[0]&&port<=range[1];
    }
  } catch { /* Missing/denied proc data is unknown, never a free-port verdict. */ }
  for (const path of ['/proc/net/tcp','/proc/net/tcp6']) {
    try {
      const lines=read(path,'utf8').split('\n');result.tcpTablesRead++;
      for (const line of lines) {
        const columns=line.trim().split(/\s+/),local=columns[1],state=columns[3]?.toUpperCase();
        if (!local || !/^[0-9A-Fa-f]+:[0-9A-Fa-f]{4}$/.test(local) || !names[state]) continue;
        if (parseInt(local.split(':')[1],16)===port) result.tcpStates[names[state]]=(result.tcpStates[names[state]]??0)+1;
      }
    } catch { /* No raw filesystem diagnostic escapes into general logs. */ }
  }
  if (result.tcpTablesRead===0) result.source='unavailable';
  return result;
}

export async function assertNativeHTTPPortsFree(ports) {
  for (const port of ports.ports) await new Promise((ok,fail)=>{
    const socket=net.createServer();
    socket.once('error',error=>{
      const diagnostic={phase:'port-preflight',port,code:error.code??'UNKNOWN',...nativeHTTPPortObservation(port)};
      fail(Error(`Disposable test port unavailable: 127.0.0.1:${port}; ${JSON.stringify(diagnostic)}`));
    });
    socket.listen(port,'127.0.0.1',()=>socket.close(ok));
  });
}
