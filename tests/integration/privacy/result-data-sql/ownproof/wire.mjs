// Load the actual sole TS producer. Standalone SQL worktree uses its fixed
// sibling; after integration the repository's producer is used directly.
import {existsSync} from 'node:fs';import {fileURLToPath,pathToFileURL} from 'node:url';import {resolve} from 'node:path';
const repo=fileURLToPath(new URL('../../../../../',import.meta.url));
export const wireRoot=existsSync(resolve(repo,'lib/server/privacy/result-data/protocol.ts'))?repo:
 resolve(process.env.VP_RESULT_DATA_TS_ROOT??resolve(repo,'../vpj58-result-data-server-20261007'));
export const protocol=await import(pathToFileURL(resolve(wireRoot,'lib/server/privacy/result-data/protocol.ts')).href);
export const contract=await import(pathToFileURL(resolve(wireRoot,'lib/server/privacy/result-data/contract.ts')).href);
export const {decodeResultPreview,decodeResultReceipt,decodeResultList,validOperationRow}=protocol;
