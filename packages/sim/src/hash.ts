// The state hash is the equality oracle for determinism and save round-trip: a total
// function of world state, independent of key insertion order and float formatting.

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/**
 * Deterministic serialisation: object keys sorted, no whitespace. Throws on NaN,
 * Infinity and undefined rather than emitting `null` as JSON.stringify would, so a
 * determinism bug cannot hide in the hash.
 */
export function canonicalise(value: JsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`canonicalise: non-finite number ${String(value)} in sim state`);
    }
    return Object.is(value, -0) ? '0' : String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalise).join(',')}]`;
  }
  const record = value as { readonly [key: string]: JsonValue };
  const keys = Object.keys(record).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const entry = record[key];
    if (entry === undefined) {
      throw new Error(`canonicalise: undefined value at key "${key}" in sim state`);
    }
    parts.push(`${JSON.stringify(key)}:${canonicalise(entry)}`);
  }
  return `{${parts.join(',')}}`;
}

function fnv1a(input: string, offsetBasis: number): number {
  let hash = offsetBasis >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash ^ input.charCodeAt(i)) >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const toHex8 = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');

/** 64-bit hash as 16 lowercase hex chars: two FNV-1a passes with distinct bases. */
export function hashJson(value: JsonValue): string {
  const canonical = canonicalise(value);
  return toHex8(fnv1a(canonical, 0x811c9dc5)) + toHex8(fnv1a(canonical, 0x9e3779b9));
}
