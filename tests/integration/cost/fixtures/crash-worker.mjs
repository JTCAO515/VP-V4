import { runWithDurableBudget } from '../../../../lib/server/model-gateway/budget/durable.ts';
import { rpc } from './postgres-rpc.mjs';
const [container, serialized] = process.argv.slice(2);
await runWithDurableBudget(JSON.parse(serialized), rpc(container), async () => {
  process.stdout.write('DISPATCHED\n');
  return new Promise(() => {});
}, new AbortController().signal);
