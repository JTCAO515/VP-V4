import {nativeHTTPOptions} from './native-http-ports.mjs';

export function journeysGoalIndexHTTPOptions(args, env = {}) {
  const selection = env.VP_NATIVE_HTTP_PORT_BASE === undefined && !args.includes('--port-base')
    ? {...env, VP_NATIVE_HTTP_PORT_BASE: '63820'} : env;
  const options = nativeHTTPOptions(args, selection);
  if (options.mode !== undefined) throw new Error('This runner accepts only --port-base');
  return options;
}
