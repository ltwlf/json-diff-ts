import type { IChange, Options, NormalizedOptions, KeySeg, EmbeddedKey, FunctionKey, EmbeddedObjKeysType, EmbeddedObjKeysMapType, Operation } from './types.js';
import { arrayDifference as difference, arrayIntersection as intersection } from './helpers.js';
import { getKey, shouldSkipPath, isArrayElementContext, getObjectKey, getTypeOfObj } from './path-utils.js';
import { detectArrayMoves, convertArrayToObj } from './array-utils.js';

/* =======================
 * Core Diff Functionality  
 * ======================= */

/**
 * Computes the difference between two values.
 */
export function diff(
  oldObj: unknown,
  newObj: unknown,
  options: Options = {}
): IChange[] {
  const normalized = normalizeOptions(options);

  // Normalize: trim leading '.' from keys in embeddedObjKeys
  const embeddedObjKeys = trimLeadingDots(normalized.embeddedObjKeys);

  return compare(oldObj, newObj, [], [], {
    ...normalized,
    embeddedObjKeys
  });
}

/* =======================
 * Options Handling
 * ======================= */

const defaultOptions: Pick<NormalizedOptions, 'keysToSkip' | 'treatTypeChangeAsReplace' | 'detectArrayMoves'> = {
  keysToSkip: [],
  treatTypeChangeAsReplace: true,
  detectArrayMoves: false
};

export function normalizeOptions(options: Options): NormalizedOptions {
  return {
    embeddedObjKeys: options.embeddedObjKeys,
    keysToSkip: options.keysToSkip ?? defaultOptions.keysToSkip,
    treatTypeChangeAsReplace: options.treatTypeChangeAsReplace ?? defaultOptions.treatTypeChangeAsReplace,
    detectArrayMoves: options.detectArrayMoves ?? defaultOptions.detectArrayMoves
  };
}

export function trimLeadingDots(
  embedded: EmbeddedObjKeysType | EmbeddedObjKeysMapType | undefined
) {
  if (!embedded) return embedded;
  if (embedded instanceof Map) {
    return new Map(
      Array.from(embedded.entries()).map(([key, value]) => [
        key instanceof RegExp ? key : key.replace(/^\./, ''),
        value
      ])
    ) as EmbeddedObjKeysMapType;
  }
  return Object.fromEntries(
    Object.entries(embedded).map(([key, value]) => [key.replace(/^\./, ''), value])
  ) as EmbeddedObjKeysType;
}

/* =======================
 * Core Comparison Functions
 * ======================= */

function handleTypeChange(
  oldObj: unknown, 
  newObj: unknown, 
  path: KeySeg[], 
  typeOfOldObj: string, 
  typeOfNewObj: string
): IChange[] {
  const changes: IChange[] = [];
  
  if (typeOfOldObj !== 'undefined') {
    changes.push({ type: 'REMOVE' as Operation, key: getKey(path), value: oldObj });
  }

  // For arrays, undefined is a real value; otherwise skip undefined ADD
  const inArray = isArrayElementContext(path);
  if (typeOfNewObj !== 'undefined' || inArray) {
    changes.push({ type: 'ADD' as Operation, key: getKey(path), value: newObj });
  }
  
  return changes;
}

function handleUndefinedTransition(oldObj: unknown, newObj: unknown, path: KeySeg[]): IChange[] {
  return isArrayElementContext(path)
    ? [{ type: 'UPDATE' as Operation, key: getKey(path), value: newObj, oldValue: oldObj }]
    : [{ type: 'REMOVE' as Operation, key: getKey(path), value: oldObj }];
}

function handleDateComparison(oldObj: unknown, newObj: unknown, path: KeySeg[], typeOfNewObj: string): IChange[] {
  if (typeOfNewObj === 'Date') {
    return comparePrimitives((oldObj as Date).getTime(), (newObj as Date).getTime(), path).map((x) => ({
      ...x,
      value: new Date(x.value as number),
      oldValue: new Date(x.oldValue as number)
    }));
  }
  return comparePrimitives(oldObj, newObj, path);
}

function handleObjectComparison(
  oldObj: unknown,
  newObj: unknown,
  path: KeySeg[],
  keyPath: string[],
  options: NormalizedOptions
): IChange[] {
  const diffs = compareObject(
    oldObj as Record<string, unknown>,
    newObj as Record<string, unknown>,
    path,
    keyPath,
    false,
    options
  );
  
  if (!diffs.length) return [];
  
  return path.length
    ? [{ type: 'UPDATE' as Operation, key: getKey(path), changes: diffs }]
    : diffs;
}

export function compare(
  oldObj: unknown,
  newObj: unknown,
  path: KeySeg[],
  keyPath: string[],
  options: NormalizedOptions
): IChange[] {
  // Path skip check (skip target path and deeper descendants)
  const currentPath = keyPath.join('.');
  if (shouldSkipPath(currentPath, options.keysToSkip)) {
    return [];
  }

  const typeOfOldObj = getTypeOfObj(oldObj);
  const typeOfNewObj = getTypeOfObj(newObj);

  // Replace on type change
  if (options.treatTypeChangeAsReplace && typeOfOldObj !== typeOfNewObj) {
    return handleTypeChange(oldObj, newObj, path, typeOfOldObj, typeOfNewObj);
  }

  // Transition to undefined: array elements keep undefined as a value, object props remove
  if (typeOfNewObj === 'undefined' && typeOfOldObj !== 'undefined') {
    return handleUndefinedTransition(oldObj, newObj, path);
  }

  // Rare corner: Object vs Array flip (keep previous behavior)
  if (typeOfNewObj === 'Object' && typeOfOldObj === 'Array') {
    return [{ type: 'UPDATE' as Operation, key: getKey(path), value: newObj, oldValue: oldObj }];
  }

  if (typeOfNewObj === null) {
    if (typeOfOldObj !== null) {
      return [{ type: 'UPDATE' as Operation, key: getKey(path), value: newObj, oldValue: oldObj }];
    }
    return [];
  }

  switch (typeOfOldObj) {
    case 'Date':
      return handleDateComparison(oldObj, newObj, path, typeOfNewObj);

    case 'Object':
      return handleObjectComparison(oldObj, newObj, path, keyPath, options);

    case 'Array':
      return compareArray(oldObj as unknown[], newObj, path, keyPath, options);

    case 'Function':
      // Functions are not diffed
      return [];

    default:
      return comparePrimitives(oldObj, newObj, path);
  }
}

export function compareObject(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  path: KeySeg[],
  keyPath: string[],
  skipPath = false,
  options: NormalizedOptions
): IChange[] {
  let changes: IChange[] = [];

  const oldObjKeys = Object.keys(oldObj);
  const newObjKeys = Object.keys(newObj);

  const intersectionKeys = intersection(oldObjKeys, newObjKeys);
  for (const k of intersectionKeys) {
    const newPath = path.concat([k]);
    const newKeyPath = skipPath ? keyPath : keyPath.concat([k]);
    const diffs = compare(oldObj[k], newObj[k], newPath, newKeyPath, options);
    if (diffs.length) changes = changes.concat(diffs);
  }

  const addedKeys = difference(newObjKeys, oldObjKeys);
  for (const k of addedKeys) {
    const newPath = path.concat([k]);
    const newKeyPath = skipPath ? keyPath : keyPath.concat([k]);

    const current = newKeyPath.join('.');
    if (options.keysToSkip.some((sp) => current === sp || current.startsWith(`${sp}.`))) {
      continue;
    }
    changes.push({ type: 'ADD' as Operation, key: getKey(newPath), value: newObj[k] });
  }

  const deletedKeys = difference(oldObjKeys, newObjKeys);
  for (const k of deletedKeys) {
    const newPath = path.concat([k]);
    const newKeyPath = skipPath ? keyPath : keyPath.concat([k]);

    const current = newKeyPath.join('.');
    if (options.keysToSkip.some((sp) => current === sp || current.startsWith(`${sp}.`))) {
      continue;
    }
    changes.push({ type: 'REMOVE' as Operation, key: getKey(newPath), value: oldObj[k] });
  }

  return changes;
}

export function compareArray(
  oldObj: unknown[],
  newObj: unknown,
  path: KeySeg[],
  keyPath: string[],
  options: NormalizedOptions
): IChange[] {
  if (getTypeOfObj(newObj) !== 'Array') {
    return [
      { type: 'UPDATE' as Operation, key: getKey(path), value: newObj, oldValue: oldObj }
    ];
  }

  const left = getObjectKey(options.embeddedObjKeys, keyPath);
  const uniqKey: EmbeddedKey = left ?? '$index';

  const indexedOldObj = convertArrayToObj(oldObj, uniqKey);
  const indexedNewObj = convertArrayToObj(newObj as unknown[], uniqKey);
  const diffs = compareObject(indexedOldObj, indexedNewObj, path, keyPath, true, options);

  // Optional: detect element moves when an embedded key is present
  let moveDiffs: IChange[] = [];
  if (options.detectArrayMoves && uniqKey !== '$index' && left != null) {
    moveDiffs = detectArrayMoves(oldObj, newObj as unknown[], uniqKey);
  }

  const allDiffs = [...diffs, ...moveDiffs];
  if (!allDiffs.length) return [];

  // Preserve your function-based "return key name" convention
  const embeddedKeyOut: EmbeddedKey =
    typeof uniqKey === 'function' && uniqKey.length === 2
      ? ((uniqKey as FunctionKey)((newObj as unknown[])[0], true) as string)
      : (uniqKey as EmbeddedKey);

  return [
    { type: 'UPDATE' as Operation, key: getKey(path), embeddedKey: embeddedKeyOut, changes: allDiffs }
  ];
}

export function comparePrimitives(oldObj: unknown, newObj: unknown, path: KeySeg[]): IChange[] {
  if (Object.is(oldObj, newObj)) return [];
  return [{ type: 'UPDATE' as Operation, key: getKey(path), value: newObj, oldValue: oldObj }];
}