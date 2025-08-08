import type { Changeset, IChange, Operation, EmbeddedKey, JsonKey } from './types.js';
import { addKeyValue, removeKey, moveArrayElement, modifyKeyValue } from './array-utils.js';
import { assertNever } from './path-utils.js';

/* =======================
 * Type Guards
 * ======================= */

function isRecord(obj: any): obj is Record<string | number, unknown> {
  return obj !== null && typeof obj === 'object' && !Array.isArray(obj);
}

/* =======================
 * Changeset Operations
 * ======================= */

/**
 * Applies the given changeset to an object (mutates the object).
 * 
 * @param obj - Object to apply the changeset to.
 * @param changeset - Changeset to apply.
 * @returns Same object reference.
 */
export function applyChangeset(obj: any, changeset: Changeset): any {
  if (!changeset?.length) return obj;

  for (const change of changeset) {
    const { embeddedKey } = change;
    if (isLeafChange(change)) {
      applyLeafChange(obj, change, embeddedKey);
    } else {
      if (!isRecord(obj)) {
        throw new TypeError('Expected obj to be a non-null object when applying branch change');
      }
      applyBranchChange(obj[change.key as string | number], change);
    }
  }
  return obj;
}

/**
 * Reverts the changes made to an object based on a given changeset (mutates the object).
 *
 * Same return-type rationale as `applyChangeset`.
 */
export function revertChangeset(obj: any, changeset: Changeset): any {
  if (!changeset?.length) return obj;

  // Important: do NOT mutate the caller's array.
  for (const change of [...changeset].reverse()) {
    if (!change.changes || (change.value === null && change.type === 'REMOVE' as Operation)) {
      revertLeafChange(obj, change);
    } else {
      if (!isRecord(obj)) {
        throw new TypeError('Expected obj to be a non-null object when reverting branch change');
      }
      revertBranchChange(obj[change.key as string | number], change);
    }
  }
  return obj;
}

/* =======================
 * Utility Functions
 * ======================= */

export function findArrayElement(arr: any[], key: JsonKey, embeddedKey?: EmbeddedKey): any {
  if (embeddedKey === '$index') {
    return arr[key as number];
  } else if (embeddedKey === '$value') {
    const index = arr.indexOf(key);
    return index !== -1 ? arr[index] : undefined;
  } else {
    return arr.find((el: any) => el?.[embeddedKey as string]?.toString() === key.toString());
  }
}

/* =======================
 * Helper Functions
 * ======================= */

export function isLeafChange(change: IChange): boolean {
  const { type, value } = change;
  return (
    type === 'REMOVE' as Operation ||
    type === 'MOVE' as Operation ||
    (value !== null && value !== undefined) ||
    (value === null && type === 'ADD' as Operation) ||
    (value === undefined && type === 'ADD' as Operation)
  );
}

// Operation handlers for apply operations
const applyOperationHandlers = {
  'ADD': (obj: any, change: IChange, embeddedKey?: EmbeddedKey) => 
    addKeyValue(obj, change.key, change.value, embeddedKey),
  'UPDATE': (obj: any, change: IChange) => 
    modifyKeyValue(obj, change.key, change.value),
  'REMOVE': (obj: any, change: IChange, embeddedKey?: EmbeddedKey) => 
    removeKey(obj, change.key, embeddedKey),
  'MOVE': (obj: any, change: IChange, embeddedKey?: EmbeddedKey) => 
    moveArrayElement(obj, change.key, change.oldIndex, change.newIndex, embeddedKey)
} as const;

export function applyLeafChange(obj: any, change: IChange, embeddedKey: EmbeddedKey | undefined) {
  const handler = applyOperationHandlers[change.type as keyof typeof applyOperationHandlers];
  if (!handler) {
    assertNever(change.type as never);
  }
  return handler(obj, change, embeddedKey);
}

function sortChangesForIndexRemoval(changes: IChange[]): IChange[] {
  return [...changes].sort((a, b) => {
    const aIsRemove = a.type === 'REMOVE' as Operation;
    const bIsRemove = b.type === 'REMOVE' as Operation;
    
    if (aIsRemove && bIsRemove) {
      return Number(b.key) - Number(a.key); // Sort removes in descending order
    }
    if (aIsRemove) return -1; // Removes first
    if (bIsRemove) return 1;  // Then other operations
    return Number(a.key) - Number(b.key); // Regular order for others
  });
}

export function applyArrayChange(arr: any[], change: IChange) {
  let changes = change.changes ?? [];

  // For $index removal, process from the end to avoid index shifts.
  if (change.embeddedKey === '$index') {
    changes = sortChangesForIndexRemoval(changes);
  }

  for (const sub of changes) {
    if (isLeafChange(sub)) {
      applyLeafChange(arr, sub, change.embeddedKey);
    } else {
      const element = findArrayElement(arr, sub.key, change.embeddedKey);
      if (element) applyChangeset(element, sub.changes!);
    }
  }
  return arr;
}

export function applyBranchChange(obj: any, change: IChange) {
  if (Array.isArray(obj)) return applyArrayChange(obj, change);
  return applyChangeset(obj, change.changes ?? []);
}

export function clearObject(target: any) {
  if (!isRecord(target)) {
    throw new TypeError('Expected target to be a non-null object when clearing');
  }
  // Clear all enumerable own properties - this is the standard and efficient way
  for (const prop of Object.keys(target)) {
    delete target[prop];
  }
}

// Root operation handlers for revert operations
const revertRootOperationHandlers = {
  'ADD': (obj: any) => {
    clearObject(obj);
    return obj;
  },
  'UPDATE': (obj: any, change: IChange) => {
    clearObject(obj);
    if (change.oldValue && typeof change.oldValue === 'object') Object.assign(obj, change.oldValue);
    return obj;
  },
  'REMOVE': (obj: any, change: IChange) => {
    if (change.value && typeof change.value === 'object') Object.assign(obj, change.value);
    return obj;
  },
  'MOVE': (obj: any) => obj // not meaningful at root
} as const;

// Regular operation handlers for revert operations  
const revertOperationHandlers = {
  'ADD': (obj: any, change: IChange, embeddedKey?: EmbeddedKey) => 
    removeKey(obj, change.key, embeddedKey),
  'UPDATE': (obj: any, change: IChange) => 
    modifyKeyValue(obj, change.key, change.oldValue),
  'REMOVE': (obj: any, change: IChange, embeddedKey?: EmbeddedKey) => 
    addKeyValue(obj, change.key, change.value, embeddedKey),
  'MOVE': (obj: any, change: IChange, embeddedKey?: EmbeddedKey) => 
    moveArrayElement(obj, change.key, change.newIndex, change.oldIndex, embeddedKey)
} as const;

export function revertLeafChange(
  obj: any,
  change: IChange,
  embeddedKey: EmbeddedKey = '$index'
) {
  // Special handling for $root key
  if (change.key === '$root') {
    const handler = revertRootOperationHandlers[change.type as keyof typeof revertRootOperationHandlers];
    if (!handler) {
      assertNever(change.type as never);
    }
    return handler(obj, change);
  }

  // Regular properties
  const handler = revertOperationHandlers[change.type as keyof typeof revertOperationHandlers];
  if (!handler) {
    assertNever(change.type as never);
  }
  return handler(obj, change, embeddedKey);
}

export function revertArrayChange(arr: any[], change: IChange) {
  for (const sub of change.changes ?? []) {
    if (isLeafChange(sub)) {
      revertLeafChange(arr, sub, change.embeddedKey as EmbeddedKey);
    } else {
      const element = findArrayElement(arr, sub.key, change.embeddedKey);
      if (element) revertChangeset(element, sub.changes ?? []);
    }
  }
  return arr;
}

export function revertBranchChange(obj: any, change: IChange) {
  if (Array.isArray(obj)) return revertArrayChange(obj, change);
  return revertChangeset(obj, change.changes ?? []);
}