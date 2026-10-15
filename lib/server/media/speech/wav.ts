/** Bounded PCM WAV subset, deliberately excluding compressed, stereo and streaming WAV. */
export function inspectWav(bytes: Uint8Array): Readonly<{ seconds: number; sampleRate: number; silent: boolean }> | null {
  if (bytes.length < 46 || bytes.length > 2_880_128) return null;
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE" || b.readUInt32LE(4) !== b.length - 8) return null;
  let rate = 0, data: Buffer | null = null;
  for (let offset = 12; offset < b.length;) {
    if (offset + 8 > b.length) return null;
    const name = b.toString("ascii", offset, offset + 4), size = b.readUInt32LE(offset + 4);
    const end = offset + 8 + size, next = end + (size % 2);
    if (next > b.length) return null;
    if (name === "fmt ") {
      if (rate || size !== 16 || data) return null;
      const start = offset + 8;
      rate = b.readUInt32LE(start + 4);
      if (b.readUInt16LE(start) !== 1 || b.readUInt16LE(start + 2) !== 1 || ![16000, 24000].includes(rate)
        || b.readUInt32LE(start + 8) !== rate * 2 || b.readUInt16LE(start + 12) !== 2 || b.readUInt16LE(start + 14) !== 16) return null;
    } else if (name === "data") {
      if (!rate || data || size === 0 || size % 2) return null;
      data = b.subarray(offset + 8, end);
    } else if (!["JUNK", "LIST"].includes(name)) return null;
    offset = next;
  }
  if (!data) return null;
  const seconds = data.length / (rate * 2);
  if (seconds < 0.1 || seconds > 60) return null;
  return Object.freeze({ seconds, sampleRate: rate, silent: data.every(byte => byte === 0) });
}
