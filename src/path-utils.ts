import type { JsonKey, KeySeg, EmbeddedKey, FunctionKey, EmbeddedObjKeysType, EmbeddedObjKeysMapType } from './types.js';

/* =======================
 * Path and Key Utilities
 * ======================= */

export function getKey(path: KeySeg[]): JsonKey {
  const left = path[path.length - 1];
  return left != null ? left : '$root';
}

export function isArrayIndexSegment(seg: KeySeg): boolean {
  return typeof seg === 'number' || (typeof seg === 'string' && /^\d+$/.test(seg));
}

export function isArrayElementContext(path: KeySeg[]): boolean {
  if (!path.length) return false;
  return isArrayIndexSegment(path[path.length - 1]);
}

export function shouldSkipPath(currentPath: string, keysToSkip: readonly string[]): boolean {
  if (!currentPath) return false;
  for (const skip of keysToSkip) {
    if (currentPath === skip) return true;
    if (skip && currentPath.startsWith(`${skip}.`)) return true; // descendant of skip
  }
  return false;
}

export function getObjectKey(
  embeddedObjKeys: EmbeddedObjKeysType | EmbeddedObjKeysMapType | undefined,
  keyPath: string[]
): EmbeddedKey | undefined {
  if (!embeddedObjKeys) return undefined;

  const path = keyPath.join('.');

  if (embeddedObjKeys instanceof Map) {
    for (const [key, value] of embeddedObjKeys.entries()) {
      if (key instanceof RegExp) {
        if (path.match(key)) return value;
      } else if (path === key) {
        return value;
      }
    }
  } else {
    const k = embeddedObjKeys[path];
    if (k != null) return k;

    // try matching after trimming leading dots
    for (const key of Object.keys(embeddedObjKeys)) {
      const trimmedKey = trimLeadingDots(key);
      if (path === trimmedKey) return embeddedObjKeys[key];
    }
  }

  return undefined;
}

export function trimLeadingDots(path: string): string {
  let i = 0;
  while (i < path.length && path[i] === '.') {
    i++;
  }
  return path.slice(i);
}

/* =======================
 * JSONPath helpers
 * ======================= */

export const JSON_PATH_ARRAY_SEGMENT_RE = /^([^[]+)\[\?\(@\.?([^=]*)=+'([^']+)'\)\]$|^(.+)\[(\d+)\]$/;

export function append(basePath: string, nextSegment: JsonKey): string {
  const seg = String(nextSegment);
  return seg.includes('.') ? `${basePath}[${seg}]` : `${basePath}.${seg}`;
}

/** returns a JSONPath filter expression; e.g., `$.pet[?(@.name=='spot')]` */
export function filterExpression(
  basePath: string,
  filterKey: string | FunctionKey,
  filterValue: JsonKey
) {
  const value = typeof filterValue === 'number' ? filterValue : `'${escapeJsonPathString(String(filterValue))}'`;
  if (typeof filterKey === 'string' && filterKey.includes('.')) {
    return `${basePath}[?(@[${filterKey}]==${value})]`;
  }
  // For function keys, this path is only produced when you passed back the key-name string
  return `${basePath}[?(@.${String(filterKey)}==${value})]`;
}

export function jsonPathEndsWithFilterValue(path: string, key: JsonKey): boolean {
  const filterEndIdx = path.lastIndexOf(')]');
  if (filterEndIdx === -1) return false;
  const filterStartIdx = path.lastIndexOf('==', filterEndIdx);
  if (filterStartIdx === -1) return false;
  const filterValue = path.slice(filterStartIdx + 2, filterEndIdx).replace(/(^'|'$)/g, '');
  return filterValue === String(key);
}

export function escapeJsonPathString(value: string): string {
  // Escape backslashes and single quotes inside JSONPath string literals
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function handleEmbeddedKey(
  embeddedKey: EmbeddedKey,
  obj: any,
  path: string
): [string, any[]?] {
  if (embeddedKey === '$index') {
    return [`${path}[${String(obj.key)}]`];
  }
  if (embeddedKey === '$value') {
    const p = `${path}[?(@=='${escapeJsonPathString(String(obj.key))}')]`;
    const valueType = getTypeOfObj(obj.value);
    return [p, [{ ...obj, path: p, valueType }]];
  }
  const p = filterExpression(path, embeddedKey, obj.key);
  return [p];
}

/* =======================
 * Type Utilities
 * ======================= */

export const getTypeOfObj = (obj: unknown): string | null => {
  if (typeof obj === 'undefined') return 'undefined';
  if (obj === null) return null;
  const match = /^(?:\[object\s)(.*)(?:\])$/.exec(Object.prototype.toString.call(obj));
  return match ? match[1] : 'Object';
};

/* =======================
 * Exhaustiveness
 * ======================= */

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${String(x)}`);
}