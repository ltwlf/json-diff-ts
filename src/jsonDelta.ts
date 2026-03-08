import {
  diff,
  atomizeChangeset,
  unatomizeChangeset,
  applyChangeset,
  IChange,
  IAtomicChange,
  Changeset,
  Operation,
  Options,
} from './jsonDiff.js';
import type { FunctionKey } from './helpers.js';
import {
  formatFilterLiteral,
  atomicPathToDeltaPath,
  deltaPathToAtomicPath,
  extractKeyFromAtomicPath,
} from './deltaPath.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type DeltaOp = 'add' | 'remove' | 'replace';

export interface IDeltaOperation {
  op: DeltaOp;
  path: string;
  value?: any;
  oldValue?: any;
  [key: string]: any;
}

export interface IJsonDelta {
  format: 'json-delta';
  version: number;
  operations: IDeltaOperation[];
  [key: string]: any;
}

export interface DeltaOptions extends Options {
  /** Include oldValue for reversibility. Default: true */
  reversible?: boolean;
}

// ─── Validation ─────────────────────────────────────────────────────────────

export function validateDelta(delta: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof delta !== 'object' || delta === null) {
    return { valid: false, errors: ['Delta must be a non-null object'] };
  }

  const d = delta as Record<string, any>;

  if (d.format !== 'json-delta') {
    errors.push(`Invalid or missing format: expected 'json-delta', got '${d.format}'`);
  }
  if (typeof d.version !== 'number') {
    errors.push(`Missing or invalid version: expected number, got '${typeof d.version}'`);
  }
  if (!Array.isArray(d.operations)) {
    errors.push('Missing or invalid operations: expected array');
  } else {
    for (let i = 0; i < d.operations.length; i++) {
      const op = d.operations[i];
      if (!op || typeof op !== 'object') {
        errors.push(`operations[${i}]: must be an object`);
        continue;
      }
      if (!['add', 'remove', 'replace'].includes(op.op)) {
        errors.push(`operations[${i}]: invalid op '${op.op}'`);
      }
      if (typeof op.path !== 'string') {
        errors.push(`operations[${i}]: path must be a string`);
      }
      if (op.op === 'add') {
        if (!('value' in op)) {
          errors.push(`operations[${i}]: add operation must have value`);
        }
        if ('oldValue' in op) {
          errors.push(`operations[${i}]: add operation must not have oldValue`);
        }
      }
      if (op.op === 'remove' && 'value' in op) {
        errors.push(`operations[${i}]: remove operation must not have value`);
      }
      if (op.op === 'replace' && !('value' in op)) {
        errors.push(`operations[${i}]: replace operation must have value`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── diffDelta ──────────────────────────────────────────────────────────────

/**
 * Compute a canonical JSON Delta between two objects.
 * This is the spec-conformant delta producer.
 */
export function diffDelta(oldObj: any, newObj: any, options: DeltaOptions = {}): IJsonDelta {
  const changeset = diff(oldObj, newObj, {
    ...options,
    treatTypeChangeAsReplace: true, // Always true — merging REMOVE+ADD is more reliable (B.1)
  });

  const operations: IDeltaOperation[] = [];
  walkChanges(changeset, '$', oldObj, newObj, operations, options);

  return {
    format: 'json-delta',
    version: 1,
    operations,
  };
}

/**
 * Merge adjacent REMOVE+ADD pairs on the same key into a synthetic replace.
 */
interface MergedChange extends IChange {
  isMergedReplace?: boolean;
  removeValue?: any;
  addValue?: any;
}

function mergeTypeChangePairs(changes: IChange[]): MergedChange[] {
  const result: MergedChange[] = [];
  let i = 0;
  while (i < changes.length) {
    if (
      i + 1 < changes.length &&
      changes[i].type === Operation.REMOVE &&
      changes[i + 1].type === Operation.ADD &&
      changes[i].key === changes[i + 1].key
    ) {
      result.push({
        ...changes[i],
        isMergedReplace: true,
        removeValue: changes[i].value,
        addValue: changes[i + 1].value,
      });
      i += 2;
    } else {
      result.push(changes[i]);
      i += 1;
    }
  }
  return result;
}

const SIMPLE_PROPERTY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function appendCanonicalProperty(basePath: string, name: string): string {
  if (SIMPLE_PROPERTY_RE.test(name)) {
    return `${basePath}.${name}`;
  }
  return `${basePath}['${name.replace(/'/g, "''")}']`;
}

function walkChanges(
  changes: IChange[],
  basePath: string,
  oldCtx: any,
  newCtx: any,
  ops: IDeltaOperation[],
  options: DeltaOptions
): void {
  const merged = mergeTypeChangePairs(changes);

  for (const change of merged) {
    if ((change as MergedChange).isMergedReplace) {
      const mc = change as MergedChange;
      const path = mc.key === '$root' ? '$' : appendCanonicalProperty(basePath, mc.key);
      const op: IDeltaOperation = { op: 'replace', path, value: mc.addValue };
      if (options.reversible !== false) {
        op.oldValue = mc.removeValue;
      }
      ops.push(op);
    } else if (change.changes) {
      // Branch change
      const childPath = change.key === '$root' ? '$' : appendCanonicalProperty(basePath, change.key);
      const childOld = change.key === '$root' ? oldCtx : oldCtx?.[change.key];
      const childNew = change.key === '$root' ? newCtx : newCtx?.[change.key];

      if (change.embeddedKey) {
        // Array level — process each child with filter expression
        for (const childChange of change.changes) {
          const filterPath = buildCanonicalFilterPath(
            childPath,
            change.embeddedKey,
            childChange.key,
            childOld,
            childNew,
            childChange
          );

          if (childChange.changes) {
            // Deep path after filter — recurse into matched element
            const oldEl = findElement(childOld, change.embeddedKey, childChange.key);
            const newEl = findElement(childNew, change.embeddedKey, childChange.key);
            walkChanges(childChange.changes, filterPath, oldEl, newEl, ops, options);
          } else {
            emitLeafOp(childChange, filterPath, ops, options);
          }
        }
      } else {
        // Object branch — recurse
        walkChanges(change.changes, childPath, childOld, childNew, ops, options);
      }
    } else {
      // Leaf change
      const path = change.key === '$root' ? '$' : appendCanonicalProperty(basePath, change.key);
      emitLeafOp(change, path, ops, options);
    }
  }
}

function emitLeafOp(
  change: IChange,
  path: string,
  ops: IDeltaOperation[],
  options: DeltaOptions
): void {
  switch (change.type) {
    case Operation.ADD: {
      ops.push({ op: 'add', path, value: change.value });
      break;
    }
    case Operation.REMOVE: {
      const op: IDeltaOperation = { op: 'remove', path };
      if (options.reversible !== false) {
        op.oldValue = change.value;
      }
      ops.push(op);
      break;
    }
    case Operation.UPDATE: {
      const op: IDeltaOperation = { op: 'replace', path, value: change.value };
      if (options.reversible !== false) {
        op.oldValue = change.oldValue;
      }
      ops.push(op);
      break;
    }
  }
}

/**
 * Build canonical filter path for array elements with typed literals.
 */
function buildCanonicalFilterPath(
  basePath: string,
  embeddedKey: string | FunctionKey,
  changeKey: string,
  oldArr: any[],
  newArr: any[],
  change: IChange
): string {
  if (embeddedKey === '$index') {
    return `${basePath}[${changeKey}]`;
  }

  if (embeddedKey === '$value') {
    const typedVal = findActualValue(oldArr, newArr, changeKey, change.type);
    return `${basePath}[?(@==${formatFilterLiteral(typedVal)})]`;
  }

  /* istanbul ignore next -- diff() always resolves function keys to strings in embeddedKey */
  if (typeof embeddedKey === 'function') {
    const sample = (oldArr && oldArr.length > 0 ? oldArr[0] : newArr?.[0]);
    const keyName = sample ? embeddedKey(sample, true) : changeKey;
    const element = findElementByFn(oldArr, newArr, embeddedKey, changeKey, change.type);
    if (element && typeof keyName === 'string') {
      const typedVal = element[keyName];
      const memberAccess = SIMPLE_PROPERTY_RE.test(keyName) ? `.${keyName}` : `['${keyName.replace(/'/g, "''")}']`;
      return `${basePath}[?(@${memberAccess}==${formatFilterLiteral(typedVal)})]`;
    }
    const memberAccess = typeof keyName === 'string' && SIMPLE_PROPERTY_RE.test(keyName) ? `.${keyName}` : `.${changeKey}`;
    return `${basePath}[?(@${memberAccess}=='${changeKey}')]`;
  }

  // Named string key
  const element = findElementByKey(oldArr, newArr, embeddedKey, changeKey, change.type);
  const typedVal = element ? element[embeddedKey] : changeKey;
  const memberAccess = SIMPLE_PROPERTY_RE.test(embeddedKey) ? `.${embeddedKey}` : `['${embeddedKey.replace(/'/g, "''")}']`;
  return `${basePath}[?(@${memberAccess}==${formatFilterLiteral(typedVal)})]`;
}

function findActualValue(oldArr: any[], newArr: any[], stringKey: string, opType: Operation): unknown {
  // For REMOVE, value exists in old array
  if (opType === Operation.REMOVE && oldArr) {
    for (const item of oldArr) {
      if (String(item) === stringKey) return item;
    }
  }
  // For ADD, value exists in new array
  if (opType === Operation.ADD && newArr) {
    for (const item of newArr) {
      if (String(item) === stringKey) return item;
    }
  }
  /* istanbul ignore next -- $value arrays only produce ADD/REMOVE, not UPDATE */
  // For UPDATE, check both (prefer old for the key identity)
  if (oldArr) {
    for (const item of oldArr) {
      if (String(item) === stringKey) return item;
    }
  }
  if (newArr) {
    for (const item of newArr) {
      if (String(item) === stringKey) return item;
    }
  }
  return stringKey; // fallback to string
}

function findElement(arr: any[], embeddedKey: string | FunctionKey, changeKey: string): any {
  if (!arr || !Array.isArray(arr)) return undefined;

  if (embeddedKey === '$index') {
    return arr[Number(changeKey)];
  }
  /* istanbul ignore next -- $value arrays contain primitives, no deep paths trigger findElement */
  if (embeddedKey === '$value') {
    return arr.find((item) => String(item) === changeKey);
  }
  /* istanbul ignore next -- diff() resolves function keys to strings */
  if (typeof embeddedKey === 'function') {
    return arr.find((item) => String(embeddedKey(item)) === changeKey);
  }
  return arr.find((item) => item && String(item[embeddedKey]) === changeKey);
}

function findElementByKey(
  oldArr: any[],
  newArr: any[],
  embeddedKey: string,
  changeKey: string,
  opType: Operation
): any {
  // For REMOVE ops, element is in old array. For ADD, in new. For UPDATE, prefer old.
  if (opType === Operation.REMOVE || opType === Operation.UPDATE) {
    const el = oldArr?.find((item) => item && String(item[embeddedKey]) === changeKey);
    if (el) return el;
  }
  if (opType === Operation.ADD || opType === Operation.UPDATE) {
    const el = newArr?.find((item) => item && String(item[embeddedKey]) === changeKey);
    if (el) return el;
  }
  return undefined;
}

/* istanbul ignore next -- only reachable if embeddedKey is a function, which diff() never stores */
function findElementByFn(
  oldArr: any[],
  newArr: any[],
  fn: FunctionKey,
  changeKey: string,
  opType: Operation
): any {
  if (opType === Operation.REMOVE || opType === Operation.UPDATE) {
    const el = oldArr?.find((item) => String(fn(item)) === changeKey);
    if (el) return el;
  }
  if (opType === Operation.ADD || opType === Operation.UPDATE) {
    const el = newArr?.find((item) => String(fn(item)) === changeKey);
    if (el) return el;
  }
  return undefined;
}

// ─── toDelta ────────────────────────────────────────────────────────────────

/**
 * Convert an existing v4 changeset or atomic changes to a JSON Delta document.
 * Best-effort bridge — filter literals will always be string-quoted.
 * Use `diffDelta()` for canonical spec-conformant output.
 */
export function toDelta(changeset: Changeset | IAtomicChange[], options: { reversible?: boolean } = {}): IJsonDelta {
  let atoms: IAtomicChange[];
  if (changeset.length === 0) {
    return { format: 'json-delta', version: 1, operations: [] };
  }

  // Detect if input is IAtomicChange[] (has 'path' property) or Changeset
  if ('path' in changeset[0]) {
    atoms = changeset as IAtomicChange[];
  } else {
    atoms = atomizeChangeset(changeset as Changeset);
  }

  // Convert atoms to delta operations
  const rawOps: IDeltaOperation[] = atoms.map((atom) => {
    const path = atomicPathToDeltaPath(atom.path);
    switch (atom.type) {
      case Operation.ADD:
        return { op: 'add' as DeltaOp, path, value: atom.value };
      case Operation.REMOVE: {
        const op: IDeltaOperation = { op: 'remove', path };
        if (options.reversible !== false && atom.value !== undefined) {
          op.oldValue = atom.value;
        }
        return op;
      }
      case Operation.UPDATE: {
        const op: IDeltaOperation = { op: 'replace', path, value: atom.value };
        if (options.reversible !== false && atom.oldValue !== undefined) {
          op.oldValue = atom.oldValue;
        }
        return op;
      }
      /* istanbul ignore next -- exhaustive switch */
      default:
        throw new Error(`Unknown operation type: ${atom.type}`);
    }
  });

  // Merge consecutive REMOVE+ADD at same path → single replace
  const operations = mergeConsecutiveOps(rawOps);

  return { format: 'json-delta', version: 1, operations };
}

function mergeConsecutiveOps(ops: IDeltaOperation[]): IDeltaOperation[] {
  const result: IDeltaOperation[] = [];
  let i = 0;
  while (i < ops.length) {
    if (
      i + 1 < ops.length &&
      ops[i].op === 'remove' &&
      ops[i + 1].op === 'add' &&
      ops[i].path === ops[i + 1].path
    ) {
      const merged: IDeltaOperation = {
        op: 'replace',
        path: ops[i].path,
        value: ops[i + 1].value,
      };
      if (ops[i].oldValue !== undefined) {
        merged.oldValue = ops[i].oldValue;
      }
      result.push(merged);
      i += 2;
    } else {
      result.push(ops[i]);
      i += 1;
    }
  }
  return result;
}

// ─── fromDelta ──────────────────────────────────────────────────────────────

/**
 * Convert a JSON Delta document to v4 atomic changes.
 * Returns IAtomicChange[] — one atom per delta operation.
 * Use `unatomizeChangeset(fromDelta(delta))` if you need a hierarchical Changeset.
 */
export function fromDelta(delta: IJsonDelta): IAtomicChange[] {
  const validation = validateDelta(delta);
  if (!validation.valid) {
    throw new Error(`Invalid delta: ${validation.errors.join(', ')}`);
  }

  return delta.operations.map((op) => {
    const atomicPath = deltaPathToAtomicPath(op.path);
    const key = extractKeyFromAtomicPath(atomicPath);

    switch (op.op) {
      case 'add': {
        const valueType = getValueType(op.value);
        return { type: Operation.ADD, key, path: atomicPath, valueType, value: op.value };
      }
      case 'remove': {
        const valueType = op.oldValue !== undefined ? getValueType(op.oldValue) : null;
        return { type: Operation.REMOVE, key, path: atomicPath, valueType, value: op.oldValue };
      }
      case 'replace': {
        const valueType = getValueType(op.value);
        const atom: IAtomicChange = { type: Operation.UPDATE, key, path: atomicPath, valueType, value: op.value };
        if (op.oldValue !== undefined) {
          atom.oldValue = op.oldValue;
        }
        return atom;
      }
      /* istanbul ignore next -- exhaustive switch */
      default:
        throw new Error(`Unknown operation: ${op.op}`);
    }
  });
}

function getValueType(value: any): string | null {
  if (value === undefined) return 'undefined';
  if (value === null) return null;
  if (Array.isArray(value)) return 'Array';
  const type = typeof value;
  return type.charAt(0).toUpperCase() + type.slice(1);
}

// ─── invertDelta ────────────────────────────────────────────────────────────

/**
 * Compute the inverse of a JSON Delta document (spec Section 9.2).
 * Requires all replace/remove operations to have oldValue.
 */
export function invertDelta(delta: IJsonDelta): IJsonDelta {
  const validation = validateDelta(delta);
  if (!validation.valid) {
    throw new Error(`Invalid delta: ${validation.errors.join(', ')}`);
  }

  // Validate reversibility
  for (let i = 0; i < delta.operations.length; i++) {
    const op = delta.operations[i];
    if (op.op === 'replace' && !('oldValue' in op)) {
      throw new Error(`operations[${i}]: replace operation missing oldValue — delta is not reversible`);
    }
    if (op.op === 'remove' && !('oldValue' in op)) {
      throw new Error(`operations[${i}]: remove operation missing oldValue — delta is not reversible`);
    }
  }

  // Reverse the operations array and invert each operation
  const invertedOps: IDeltaOperation[] = [...delta.operations].reverse().map((op) => {
    // Preserve extension properties (any key not in standard set)
    const extensions: Record<string, any> = {};
    for (const key of Object.keys(op)) {
      if (!['op', 'path', 'value', 'oldValue'].includes(key)) {
        extensions[key] = op[key];
      }
    }

    switch (op.op) {
      case 'add':
        return { op: 'remove' as DeltaOp, path: op.path, oldValue: op.value, ...extensions };
      case 'remove':
        return { op: 'add' as DeltaOp, path: op.path, value: op.oldValue, ...extensions };
      case 'replace':
        return { op: 'replace' as DeltaOp, path: op.path, value: op.oldValue, oldValue: op.value, ...extensions };
      /* istanbul ignore next -- exhaustive switch */
      default:
        throw new Error(`Unknown operation: ${op.op}`);
    }
  });

  // Preserve envelope extension properties
  const envelope: IJsonDelta = { format: 'json-delta', version: delta.version, operations: invertedOps };
  for (const key of Object.keys(delta)) {
    if (!['format', 'version', 'operations'].includes(key)) {
      envelope[key] = delta[key];
    }
  }

  return envelope;
}

// ─── applyDelta ─────────────────────────────────────────────────────────────

/**
 * Apply a JSON Delta document to an object.
 * Processes operations sequentially. Handles root operations directly.
 * Returns the result (MUST use return value for root primitive replacements).
 */
export function applyDelta(obj: any, delta: IJsonDelta): any {
  const validation = validateDelta(delta);
  if (!validation.valid) {
    throw new Error(`Invalid delta: ${validation.errors.join(', ')}`);
  }

  let result: any = obj;

  for (const op of delta.operations) {
    if (op.path === '$') {
      result = applyRootOp(result, op);
    } else {
      const atomicChange = deltaOpToAtomicChange(op);
      const miniChangeset = unatomizeChangeset([atomicChange]);
      applyChangeset(result, miniChangeset);
    }
  }

  return result;
}

function applyRootOp(obj: any, op: IDeltaOperation): any {
  switch (op.op) {
    case 'add':
      return op.value;
    case 'remove':
      return null;
    case 'replace': {
      // Only attempt in-place mutation when both old and new are plain objects (not arrays)
      if (
        typeof obj === 'object' && obj !== null && !Array.isArray(obj) &&
        typeof op.value === 'object' && op.value !== null && !Array.isArray(op.value)
      ) {
        for (const key of Object.keys(obj)) {
          delete obj[key];
        }
        Object.assign(obj, op.value);
        return obj;
      }
      // All other cases: return new value directly (primitives, arrays, type changes)
      return op.value;
    }
    /* istanbul ignore next -- exhaustive switch */
    default:
      throw new Error(`Unknown operation: ${op.op}`);
  }
}

function deltaOpToAtomicChange(op: IDeltaOperation): IAtomicChange {
  const atomicPath = deltaPathToAtomicPath(op.path);
  const key = extractKeyFromAtomicPath(atomicPath);

  switch (op.op) {
    case 'add':
      return { type: Operation.ADD, key, path: atomicPath, valueType: getValueType(op.value), value: op.value };
    case 'remove':
      return { type: Operation.REMOVE, key, path: atomicPath, valueType: getValueType(op.oldValue), value: op.oldValue };
    case 'replace':
      return {
        type: Operation.UPDATE,
        key,
        path: atomicPath,
        valueType: getValueType(op.value),
        value: op.value,
        oldValue: op.oldValue,
      };
    /* istanbul ignore next -- exhaustive switch */
    default:
      throw new Error(`Unknown operation: ${op.op}`);
  }
}

// ─── revertDelta ────────────────────────────────────────────────────────────

/**
 * Revert a JSON Delta by computing its inverse and applying it.
 * Requires all replace/remove operations to have oldValue.
 */
export function revertDelta(obj: any, delta: IJsonDelta): any {
  const inverse = invertDelta(delta);
  return applyDelta(obj, inverse);
}

// ─── Re-exports for convenience ─────────────────────────────────────────────

export { DeltaPathSegment, formatFilterLiteral, parseFilterLiteral, parseDeltaPath, buildDeltaPath } from './deltaPath.js';
