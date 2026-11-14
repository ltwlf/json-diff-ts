/** JSON Atom values must survive a JSON wire round-trip without changing type. */
export function isJsonValue(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;
  if (Object.getOwnPropertySymbols(value).length) return false;
  if (Array.isArray(value) && Object.keys(value).length !== value.length) return false;
  ancestors.add(value);
  const valid = Object.values(value).every(child => isJsonValue(child, ancestors));
  ancestors.delete(value);
  return valid;
}
