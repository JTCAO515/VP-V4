/** Reject duplicate object keys before forwarding original bytes. JSON.parse
 * alone discards overwritten fields, which could hide raw content in a closed
 * metadata request or original erase recovery bytes. No input is logged. */
export function parseClosedJSON(bytes: string): unknown {
  if (Buffer.byteLength(bytes) > 8192) throw Error('INVALID_INPUT');
  let position = 0;
  const space = () => { while (/[\x20\t\r\n]/.test(bytes[position] ?? '') && position < bytes.length) position++; };
  const string = (): string => {
    if (bytes[position] !== '"') throw Error('INVALID_INPUT');
    const start = position++;
    while (position < bytes.length) {
      const character = bytes[position++];
      if (character === '\\') { position++; continue; }
      if (character === '"') return JSON.parse(bytes.slice(start, position)) as string;
    }
    throw Error('INVALID_INPUT');
  };
  const value = (depth: number): unknown => {
    if (depth > 16) throw Error('INVALID_INPUT');
    space(); const character = bytes[position];
    if (character === '"') return string();
    if (character === '{') {
      position++; space(); const result: Record<string, unknown> = Object.create(null); const seen = new Set<string>();
      if (bytes[position] === '}') { position++; return result; }
      for (;;) {
        space(); const key = string(); if (seen.has(key)) throw Error('INVALID_INPUT'); seen.add(key);
        space(); if (bytes[position++] !== ':') throw Error('INVALID_INPUT'); result[key] = value(depth + 1); space();
        const separator = bytes[position++]; if (separator === '}') return result; if (separator !== ',') throw Error('INVALID_INPUT');
      }
    }
    if (character === '[') {
      position++; space(); const result: unknown[] = [];
      if (bytes[position] === ']') { position++; return result; }
      for (;;) { result.push(value(depth + 1)); space(); const separator = bytes[position++]; if (separator === ']') return result; if (separator !== ',') throw Error('INVALID_INPUT'); }
    }
    const token = /^(?:null|true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(bytes.slice(position));
    if (!token) throw Error('INVALID_INPUT'); position += token[0].length; return JSON.parse(token[0]);
  };
  const result = value(0); space(); if (position !== bytes.length) throw Error('INVALID_INPUT'); return result;
}
