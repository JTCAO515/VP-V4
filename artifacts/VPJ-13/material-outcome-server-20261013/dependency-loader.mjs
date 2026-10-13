// Validation-only resolver: reuse installed identical project dependencies without modifying shared paths.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(new URL('package.json', pathToFileURL((process.env.VP_MATERIAL_DEPENDENCY_ROOT ?? process.cwd()) + '/')));
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); }
  catch (error) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('node:'))
      return { url: pathToFileURL(require.resolve(specifier)).href, shortCircuit: true };
    throw error;
  }
}
