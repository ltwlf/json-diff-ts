import type { JsonKey, EmbeddedKey, FunctionKey, IChange, Operation } from './types.js';
import { keyBy } from './helpers.js';

/* =======================
 * Array Utilities
 * ======================= */

export function detectArrayMoves(
  oldArray: unknown[],
  newArray: unknown[],
  uniqKey: EmbeddedKey
): IChange[] {
  const moves: IChange[] = [];

  const keyFn = typeof uniqKey === 'string' ? (item: any) => item?.[uniqKey] : (uniqKey as FunctionKey);

  const oldIndexMap = new Map<unknown, number>();
  const newIndexMap = new Map<unknown, number>();

  oldArray.forEach((item, index) => {
    const key = keyFn(item);
    oldIndexMap.set(key, index);
  });

  newArray.forEach((item, index) => {
    const key = keyFn(item);
    newIndexMap.set(key, index);
  });

  for (const [key, newIndex] of newIndexMap) {
    if (!oldIndexMap.has(key)) continue;
    const oldIndex = oldIndexMap.get(key)!;
    if (oldIndex !== newIndex) {
      moves.push({ type: 'MOVE' as Operation, key: key as JsonKey, oldIndex, newIndex, value: newArray[newIndex] });
    }
  }

  return moves;
}

export function convertArrayToObj(arr: any[], uniqKey: EmbeddedKey) {
  let obj: Record<string | number, any> = {};
  if (uniqKey === '$value') {
    for (const value of arr) obj[value] = value;
  } else if (uniqKey !== '$index') {
    const keyFunction = typeof uniqKey === 'string' 
      ? (item: unknown) => (item as Record<string, unknown>)?.[uniqKey] 
      : uniqKey;
    obj = keyBy(arr, keyFunction);
  } else {
    for (let i = 0; i < arr.length; i++) obj[i] = arr[i];
  }
  return obj;
}

export function indexOfItemInArray(arr: any[], key: EmbeddedKey, value: unknown): number {
  if (key === '$value') return arr.indexOf(value);

  const keyFunction = typeof key === 'string' 
    ? (item: unknown) => (item as Record<string, unknown>)?.[key] 
    : (key as FunctionKey);

  for (let i = 0; i < arr.length; i++) {
    const candidate = keyFunction(arr[i]);
    if (candidate != null && String(candidate) === String(value)) return i;
  }
  return -1;
}

function findElementIndex(
  arr: any[], 
  key: JsonKey, 
  oldIndex: number | undefined, 
  embeddedKey: EmbeddedKey | undefined
): number {
  if (embeddedKey === '$index') {
    return oldIndex ?? -1;
  }
  
  if (embeddedKey === '$value') {
    return arr.indexOf(key);
  }
  
  const keyFunction = embeddedKey && typeof embeddedKey === 'string' 
    ? (item: unknown) => (item as Record<string, unknown>)?.[embeddedKey]
    : (embeddedKey as FunctionKey | undefined);

  return arr.findIndex((item) => {
    const k = keyFunction ? keyFunction(item) : undefined;
    return k != null && String(k) === String(key);
  });
}

export function moveArrayElement(
  arr: any[],
  key: JsonKey,
  oldIndex: number | undefined,
  newIndex: number | undefined,
  embeddedKey: EmbeddedKey | undefined
) {
  if (!Array.isArray(arr)) return;

  const elementIndex = findElementIndex(arr, key, oldIndex, embeddedKey);
  
  if (elementIndex === -1 || newIndex == null) {
    // Element not found for MOVE operation - fail silently
    return;
  }

  const element = arr.splice(elementIndex, 1)[0];
  arr.splice(newIndex, 0, element);
  return arr;
}

export function addKeyValue(obj: any, key: JsonKey, value: unknown, embeddedKey?: EmbeddedKey) {
  if (Array.isArray(obj)) {
    if (embeddedKey === '$index') {
      obj.splice(Number(key), 0, value);
      return obj.length;
    } else {
      obj.push(value);
      return obj.length;
    }
  } else {
    const objRecord = obj as Record<string | number, unknown>;
    objRecord[key as string | number] = value;
    return obj;
  }
}

export function removeKey(obj: any, key: JsonKey, embeddedKey: EmbeddedKey | undefined) {
  if (Array.isArray(obj)) {
    if (embeddedKey === '$index') {
      obj.splice(Number(key), 1);
      return;
    }
    const index = indexOfItemInArray(obj, embeddedKey!, key);
    if (index === -1) {
      // Element not found in array - fail silently
      return;
    }
    obj.splice(index, 1);
    return;
  }
  const objRecord = obj as Record<string | number, unknown>;
  delete objRecord[key as string | number];
}

export const modifyKeyValue = (obj: any, key: JsonKey, value: unknown) => {
  const objRecord = obj as Record<string | number, unknown>;
  objRecord[key as string | number] = value;
  return obj;
};