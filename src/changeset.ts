import type { Changeset, IChange, Operation, EmbeddedKey } from './types.js';
import { addKeyValue, removeKey, moveArrayElement, modifyKeyValue } from './array-utils.js';
import { assertNever } from './path-utils.js';

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
      applyLeafChange(obj as any, change, embeddedKey);
    } else {
      applyBranchChange((obj as any)[change.key as any], change);
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
      revertLeafChange(obj as any, change);
    } else {
      revertBranchChange((obj as any)[change.key as any], change);
    }
  }
  return obj;
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

export function applyLeafChange(obj: any, change: IChange, embeddedKey: EmbeddedKey | undefined) {
  const { type, key, value, oldIndex, newIndex } = change;
  switch (type) {
    case 'ADD' as Operation:
      return addKeyValue(obj, key, value, embeddedKey);
    case 'UPDATE' as Operation:
      return modifyKeyValue(obj, key, value);
    case 'REMOVE' as Operation:
      return removeKey(obj, key, embeddedKey);
    case 'MOVE' as Operation:
      return moveArrayElement(obj, key, oldIndex, newIndex, embeddedKey);
    default:
      assertNever(type as never);
  }
}

export function applyArrayChange(arr: any[], change: IChange) {
  let changes = change.changes ?? [];

  // For $index removal, process from the end to avoid index shifts.
  if (change.embeddedKey === '$index') {
    changes = [...changes].sort((a, b) => {
      if (a.type === 'REMOVE' as Operation && b.type === 'REMOVE' as Operation) return Number(b.key) - Number(a.key);
      if (a.type === 'REMOVE' as Operation) return -1;
      if (b.type === 'REMOVE' as Operation) return 1;
      return Number(a.key) - Number(b.key);
    });
  }

  for (const sub of changes) {
    if (isLeafChange(sub)) {
      applyLeafChange(arr, sub, change.embeddedKey);
    } else {
      let element: any;
      if (change.embeddedKey === '$index') {
        element = arr[sub.key as number];
      } else if (change.embeddedKey === '$value') {
        const index = arr.indexOf(sub.key);
        if (index !== -1) element = arr[index];
      } else {
        element = arr.find((el: any) => el?.[change.embeddedKey as string]?.toString() === sub.key.toString());
      }
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
  for (const prop of Object.keys(target)) delete (target as any)[prop];
}

export function revertLeafChange(
  obj: any,
  change: IChange,
  embeddedKey: EmbeddedKey = '$index'
) {
  const { type, key, value, oldValue, oldIndex, newIndex } = change;

  // Special handling for $root key
  if (key === '$root') {
    switch (type) {
      case 'ADD' as Operation: {
        clearObject(obj);
        return obj;
      }
      case 'UPDATE' as Operation: {
        clearObject(obj);
        if (oldValue && typeof oldValue === 'object') Object.assign(obj, oldValue);
        return obj;
      }
      case 'REMOVE' as Operation: {
        if (value && typeof value === 'object') Object.assign(obj, value);
        return obj;
      }
      case 'MOVE' as Operation: {
        return obj; // not meaningful at root
      }
      default:
        assertNever(type as never);
    }
  }

  // Regular properties
  switch (type) {
    case 'ADD' as Operation:
      return removeKey(obj, key, embeddedKey);
    case 'UPDATE' as Operation:
      return modifyKeyValue(obj, key, oldValue);
    case 'REMOVE' as Operation:
      return addKeyValue(obj, key, value);
    case 'MOVE' as Operation:
      // Revert move: move back from newIndex to oldIndex
      return moveArrayElement(obj, key, newIndex, oldIndex, embeddedKey);
    default:
      assertNever(type as never);
  }
}

export function revertArrayChange(arr: any[], change: IChange) {
  for (const sub of change.changes ?? []) {
    if (isLeafChange(sub)) {
      revertLeafChange(arr, sub, change.embeddedKey as EmbeddedKey);
    } else {
      let element: any;
      if (change.embeddedKey === '$index') {
        element = arr[Number(sub.key)];
      } else if (change.embeddedKey === '$value') {
        const index = arr.indexOf(sub.key);
        if (index !== -1) element = arr[index];
      } else {
        element = arr.find((el: any) => el?.[change.embeddedKey as string]?.toString() === sub.key.toString());
      }
      if (element) revertChangeset(element, sub.changes ?? []);
    }
  }
  return arr;
}

export function revertBranchChange(obj: any, change: IChange) {
  if (Array.isArray(obj)) return revertArrayChange(obj, change);
  return revertChangeset(obj, change.changes ?? []);
}