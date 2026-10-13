import { associateMaterialOutcome, type OriginalMaterialReads } from './consumer.ts';
import { denied, source, type Association } from './contract.ts';
import { createOriginalMaterialReads } from './original-reads.ts';

/** Original holder composes this inside its authenticated request lifetime.
 * The protected selection callback cannot be sourced from caller JSON or success ACK.
 * The ordinary source adapters expose read operations only; no measurement or Trip sink. */
export async function readOriginalMaterialOutcome(requested: unknown,
  request: Pick<Request, 'headers' | 'signal'>,
  config: Readonly<{ url: string; publishableKey: string }>,
  protectedSelection: OriginalMaterialReads['readSelection'] | null = null): Promise<Association> {
  if (!source(requested)) return denied('invalid_source');
  if (requested.anchor.medium !== 'pdf') return denied('unobservable');
  const original = await createOriginalMaterialReads(request, config, protectedSelection);
  if (!original) return denied('unobservable');
  try { return await associateMaterialOutcome(requested, original.reads, { signal: request.signal }); }
  finally { original.dispose(); }
}
