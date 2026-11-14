import { isJsonValue } from './atomValidation.js';
import { applyAtomOperations } from './atomApply.js';
import {
  diff,
  atomizeChangeset,
  IChange,
  IAtomicChange,
  Changeset,
  Operation,
  Options,
} from './jsonDiff.js';
import type { FunctionKey } from './helpers.js';
import {
  formatFilterLiteral,
  parseAtomPath,
  buildAtomPath,
  atomicPathToAtomPath,
  atomPathToAtomicPath,
  extractKeyFromAtomicPath,
} from './atomPath.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AtomOp = 'add' | 'remove' | 'replace' | 'move' | 'copy';

export interface IAtomOperation {
  op: AtomOp;
  path: string;
  from?: string;
  value?: any;
  oldValue?: any;
  [key: string]: any;
}

export interface IJsonAtom {
  format: 'json-atom';
  version: number;
  operations: IAtomOperation[];
  [key: string]: any;
}

export interface AtomOptions extends Options {
  /** Include oldValue for reversibility. Default: true */
  reversible?: boolean;
}

// ─── Validation ─────────────────────────────────────────────────────────────

export function validateAtom(atom: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof atom !== 'object' || atom === null) {
    return { valid: false, errors: ['Atom must be a non-null object'] };
  }

  const d = atom as Record<string, any>;

  if (d.format !== 'json-atom') {
    errors.push(`Invalid or missing format: expected 'json-atom', got '${d.format}'`);
  }
  if (d.version !== 1) {
    errors.push(`Missing or invalid version: expected 1, got '${d.version}'`);
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
      if (!['add', 'remove', 'replace', 'move', 'copy'].includes(op.op)) {
        errors.push(`operations[${i}]: invalid op '${op.op}'`);
      }
      if (typeof op.path !== 'string') {
        errors.push(`operations[${i}]: path must be a string`);
      }
      for (const field of ['value', 'oldValue']) {
        if (field in op && !isJsonValue(op[field])) errors.push(`operations[${i}]: ${field} must be a JSON value`);
      }
      for (const field of ['path', ...(['move', 'copy'].includes(op.op) ? ['from'] : [])]) {
        if (typeof op[field] === 'string') {
          try { parseAtomPath(op[field]); }
          catch (error) { errors.push(`operations[${i}]: invalid ${field}: ${(error as Error).message}`); }
        }
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
      if (op.op === 'move') {
        if (typeof op.from !== 'string') {
          errors.push(`operations[${i}]: move operation must have from (string)`);
        }
        if ('value' in op) {
          errors.push(`operations[${i}]: move operation must not have value`);
        }
        if ('oldValue' in op) {
          errors.push(`operations[${i}]: move operation must not have oldValue`);
        }
        if (typeof op.from === 'string' && typeof op.path === 'string' && !errors.length) {
          const from = buildAtomPath(parseAtomPath(op.from));
          const path = buildAtomPath(parseAtomPath(op.path));
          if (from === path) {
            errors.push(`operations[${i}]: move operation from must not equal path (self-move)`);
          }
          if (path.startsWith(from + '.') || path.startsWith(from + '[')) {
            errors.push(`operations[${i}]: move operation path must not be a subtree of from`);
          }
        }
      }
      if (op.op === 'copy') {
        if (typeof op.from !== 'string') {
          errors.push(`operations[${i}]: copy operation must have from (string)`);
        }
        if ('oldValue' in op) {
          errors.push(`operations[${i}]: copy operation must not have oldValue`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── diffAtom ──────────────────────────────────────────────────────────────

/**
 * Compute a canonical JSON Atom between two objects.
 * This is the spec-conformant atom producer.
 */
export function diffAtom(oldObj: any, newObj: any, options: AtomOptions = {}): IJsonAtom {
  const changeset = diff(oldObj, newObj, {
    ...options,
    treatTypeChangeAsReplace: true, // Always true — merging REMOVE+ADD is more reliable (B.1)
  });

  const operations: IAtomOperation[] = [];
  walkChanges(changeset, '$', oldObj, newObj, operations, options);
  if (operations.length === 1 && operations[0].path === '$') {
    if (oldObj === null && newObj !== null) operations[0] = { op: 'add', path: '$', value: newObj };
    if (newObj === null && oldObj !== null) {
      operations[0] = { op: 'remove', path: '$', ...(options.reversible === false ? {} : { oldValue: oldObj }) };
    }
  }

  const atom: IJsonAtom = { format: 'json-atom', version: 1, operations };
  const validation = validateAtom(atom);
  if (!validation.valid) throw new Error(`Cannot produce JSON Atom: ${validation.errors.join(', ')}`);
  return atom;
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

const NESTED_PATH_RE = /^[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;
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
  ops: IAtomOperation[],
  options: AtomOptions
): void {
  const merged = mergeTypeChangePairs(changes);

  for (const change of merged) {
    const isRoot = change.key === '$root' && basePath === '$' && (
      oldCtx === null || newCtx === null || typeof oldCtx !== 'object' || typeof newCtx !== 'object'
      || Array.isArray(oldCtx) || Array.isArray(newCtx)
    );
    if ((change as MergedChange).isMergedReplace) {
      const mc = change as MergedChange;
      const path = isRoot ? '$' : appendCanonicalProperty(basePath, mc.key);
      const op: IAtomOperation = { op: 'replace', path, value: mc.addValue };
      if (options.reversible !== false) {
        op.oldValue = mc.removeValue;
      }
      ops.push(op);
    } else if (change.changes) {
      // Branch change
      const childPath = isRoot ? '$' : appendCanonicalProperty(basePath, change.key);
      const childOld = isRoot ? oldCtx : oldCtx?.[change.key];
      const childNew = isRoot ? newCtx : newCtx?.[change.key];

      if (change.embeddedKey) {
        // Array level — process each child with filter expression
        walkArrayChanges(change, childPath, childOld, childNew, ops, options);
      } else {
        // Object branch — recurse
        walkChanges(change.changes, childPath, childOld, childNew, ops, options);
      }
    } else {
      // Leaf change
      const path = isRoot ? '$' : appendCanonicalProperty(basePath, change.key);
      emitLeafOp(change, path, ops, options);
    }
  }
}

function walkArrayChanges(
  change: IChange, path: string, oldArr: any[], newArr: any[], ops: IAtomOperation[], options: AtomOptions
): void {
  const ordered = orderArrayChildChanges(change.changes!, change.embeddedKey!);
  for (const child of mergeTypeChangePairs(ordered)) {
    const childPath = buildCanonicalFilterPath(path, change.embeddedKey!, child.key, oldArr, newArr, child, change.embeddedKeyIsPath);
    if (child.isMergedReplace) {
      ops.push({ op: 'replace', path: childPath, value: child.addValue,
        ...(options.reversible === false ? {} : { oldValue: child.removeValue }) });
    } else if (child.changes) {
      const oldEl = findElement(oldArr, change.embeddedKey!, child.key, change.embeddedKeyIsPath);
      const newEl = findElement(newArr, change.embeddedKey!, child.key, change.embeddedKeyIsPath);
      if (child.embeddedKey) walkArrayChanges(child, childPath, oldEl, newEl, ops, options);
      else walkChanges(child.changes, childPath, oldEl, newEl, ops, options);
    } else {
      emitLeafOp(child, childPath, ops, options);
    }
  }
}

function orderArrayChildChanges(changes: IChange[], embeddedKey: string | FunctionKey): IChange[] {
  if (embeddedKey !== '$index') {
    return changes;
  }

  type OrderedGroup = { kind: 'pure-remove' } | { kind: 'preserved'; changes: IChange[] };
  const groups: OrderedGroup[] = [];
  const pureRemoves: IChange[] = [];

  for (let i = 0; i < changes.length; i++) {
    const current = changes[i];
    const next = changes[i + 1];

    // Keep REMOVE+ADD type-change pairs together and in original order.
    if (
      current.type === Operation.REMOVE &&
      next &&
      next.type === Operation.ADD &&
      String(current.key) === String(next.key)
    ) {
      groups.push({ kind: 'preserved', changes: [current, next] });
      i++;
      continue;
    }

    if (current.type === Operation.REMOVE) {
      pureRemoves.push(current);
      groups.push({ kind: 'pure-remove' });
      continue;
    }

    groups.push({ kind: 'preserved', changes: [current] });
  }

  if (pureRemoves.length < 2) {
    return changes;
  }

  const removeIndices = pureRemoves.map((change) => Number(change.key));
  /* istanbul ignore next -- $index keys are always integer-like from diff(); fallback is defensive */
  if (removeIndices.some((idx) => !Number.isInteger(idx))) {
    // Defensive fallback: if keys are not numeric, keep original order.
    return changes;
  }

  pureRemoves.sort((a, b) => Number(b.key) - Number(a.key));

  const ordered: IChange[] = [];
  let removeIndex = 0;
  for (const group of groups) {
    if (group.kind === 'pure-remove') {
      ordered.push(pureRemoves[removeIndex++]);
    } else {
      ordered.push(...group.changes);
    }
  }

  return ordered;
}

function emitLeafOp(
  change: IChange,
  path: string,
  ops: IAtomOperation[],
  options: AtomOptions
): void {
  switch (change.type) {
    case Operation.ADD: {
      ops.push({ op: 'add', path, value: change.value });
      break;
    }
    case Operation.REMOVE: {
      const op: IAtomOperation = { op: 'remove', path };
      if (options.reversible !== false) {
        op.oldValue = change.value;
      }
      ops.push(op);
      break;
    }
    case Operation.UPDATE: {
      const op: IAtomOperation = { op: 'replace', path, value: change.value };
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
  change: IChange,
  embeddedKeyIsPath?: boolean
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
  const isNestedPath = embeddedKeyIsPath && NESTED_PATH_RE.test(embeddedKey);
  const element = findElementByKey(oldArr, newArr, embeddedKey, changeKey, change.type, isNestedPath);
  const resolved = element !== undefined ? resolveNestedKey(element, embeddedKey, !!isNestedPath) : undefined;
  const typedVal = resolved !== undefined ? resolved : changeKey;
  const memberAccess = SIMPLE_PROPERTY_RE.test(embeddedKey) || isNestedPath ? `.${embeddedKey}` : `['${embeddedKey.replace(/'/g, "''")}']`;
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

function findElement(arr: any[], embeddedKey: string | FunctionKey, changeKey: string, isPath = false): any {
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
  return arr.find((item) => item && String(resolveNestedKey(item, embeddedKey, isPath)) === changeKey);
}

function resolveNestedKey(item: any, key: string, isPath: boolean): any {
  if (isPath) {
    return key.split('.').reduce((c: any, s: string) => c?.[s], item);
  }
  return item?.[key];
}

function findElementByKey(
  oldArr: any[],
  newArr: any[],
  embeddedKey: string,
  changeKey: string,
  opType: Operation,
  isPath?: boolean
): any {
  const match = (item: any) => item && String(resolveNestedKey(item, embeddedKey, !!isPath)) === changeKey;
  // For REMOVE ops, element is in old array. For ADD, in new. For UPDATE, prefer old.
  if (opType === Operation.REMOVE || opType === Operation.UPDATE) {
    const el = oldArr?.find(match);
    if (el) return el;
  }
  if (opType === Operation.ADD || opType === Operation.UPDATE) {
    const el = newArr?.find(match);
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

// ─── toAtom ────────────────────────────────────────────────────────────────

/**
 * Convert an existing v4 changeset or atomic changes to a JSON Atom document.
 * Best-effort bridge — filter literals will always be string-quoted.
 * Use `diffAtom()` for canonical spec-conformant output.
 */
export function toAtom(changeset: Changeset | IAtomicChange[], options: { reversible?: boolean } = {}): IJsonAtom {
  let atoms: IAtomicChange[];
  if (changeset.length === 0) {
    return { format: 'json-atom', version: 1, operations: [] };
  }

  // Detect if input is IAtomicChange[] (has 'path' property) or Changeset
  if ('path' in changeset[0]) {
    atoms = changeset as IAtomicChange[];
  } else {
    atoms = atomizeChangeset(changeset as Changeset);
  }

  // Convert atoms to atom operations
  const rawOps: IAtomOperation[] = atoms.map((atom) => {
    const path = atomicPathToAtomPath(atom.path);
    switch (atom.type) {
      case Operation.ADD:
        return { op: 'add' as AtomOp, path, value: atom.value };
      case Operation.REMOVE: {
        const op: IAtomOperation = { op: 'remove', path };
        if (options.reversible !== false && atom.value !== undefined) {
          op.oldValue = atom.value;
        }
        return op;
      }
      case Operation.UPDATE: {
        const op: IAtomOperation = { op: 'replace', path, value: atom.value };
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
  const operations = orderLegacyIndexRemoves(mergeConsecutiveOps(rawOps));

  return { format: 'json-atom', version: 1, operations };
}

/** Legacy diffs address original array indices; remove siblings from the end. */
function orderLegacyIndexRemoves(operations: IAtomOperation[]): IAtomOperation[] {
  const groups = new Map<string, { slot: number; index: number; operation: IAtomOperation }[]>();
  operations.forEach((operation, slot) => {
    if (operation.op !== 'remove') return;
    const segments = parseAtomPath(operation.path);
    const last = segments.at(-1)!;
    if (last.type !== 'index') return;
    const parent = buildAtomPath(segments.slice(0, -1));
    const group = groups.get(parent) ?? [];
    group.push({ slot, index: last.index, operation });
    groups.set(parent, group);
  });
  const result = [...operations];
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => b.index - a.index);
    group.forEach((entry, index) => { result[entry.slot] = ordered[index].operation; });
  }
  return result;
}

function mergeConsecutiveOps(ops: IAtomOperation[]): IAtomOperation[] {
  const result: IAtomOperation[] = [];
  let i = 0;
  while (i < ops.length) {
    if (
      i + 1 < ops.length &&
      ops[i].op === 'remove' &&
      ops[i + 1].op === 'add' &&
      ops[i].path === ops[i + 1].path
    ) {
      const merged: IAtomOperation = {
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

// ─── fromAtom ──────────────────────────────────────────────────────────────

/**
 * Convert a JSON Atom document to v4 atomic changes.
 * Returns IAtomicChange[] — one atom per atom operation.
 * Use `unatomizeChangeset(fromAtom(atom))` if you need a hierarchical Changeset.
 */
export function fromAtom(atom: IJsonAtom): IAtomicChange[] {
  const validation = validateAtom(atom);
  if (!validation.valid) {
    throw new Error(`Invalid atom: ${validation.errors.join(', ')}`);
  }

  return atom.operations.map((op) => {
    if (op.op === 'move' || op.op === 'copy') {
      throw new Error(`${op.op} operations cannot be converted to v4 atomic changes`);
    }

    const atomicPath = atomPathToAtomicPath(op.path);
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

// ─── invertAtom ────────────────────────────────────────────────────────────

/**
 * Compute the inverse of a JSON Atom document (spec Section 9.2).
 * Requires all replace/remove operations to have oldValue.
 */
export function invertAtom(atom: IJsonAtom): IJsonAtom {
  const validation = validateAtom(atom);
  if (!validation.valid) {
    throw new Error(`Invalid atom: ${validation.errors.join(', ')}`);
  }

  // Validate reversibility
  for (let i = 0; i < atom.operations.length; i++) {
    const op = atom.operations[i];
    if (op.op === 'replace' && !('oldValue' in op)) {
      throw new Error(`operations[${i}]: replace operation missing oldValue — atom is not reversible`);
    }
    if (op.op === 'remove' && !('oldValue' in op)) {
      throw new Error(`operations[${i}]: remove operation missing oldValue — atom is not reversible`);
    }
    if (op.op === 'copy' && !('value' in op)) {
      throw new Error(`operations[${i}]: copy operation missing value — atom is not reversible`);
    }
  }

  // Reverse the operations array and invert each operation
  const invertedOps: IAtomOperation[] = [...atom.operations].reverse().map((op) => {
    // Preserve extension properties (any key not in standard set)
    const extensions: Record<string, any> = {};
    for (const key of Object.keys(op)) {
      if (!['op', 'path', 'from', 'value', 'oldValue'].includes(key)) {
        extensions[key] = op[key];
      }
    }

    switch (op.op) {
      case 'add':
        return { op: 'remove' as AtomOp, path: op.path, oldValue: op.value, ...extensions };
      case 'remove':
        return { op: 'add' as AtomOp, path: op.path, value: op.oldValue, ...extensions };
      case 'replace': {
        if (op.path === '$' && op.value === null) return { op: 'add' as AtomOp, path: '$', value: op.oldValue, ...extensions };
        const segments = parseAtomPath(op.path);
        const last = segments.at(-1)!;
        if (last.type === 'valueFilter') last.value = op.value;
        return { op: 'replace' as AtomOp, path: buildAtomPath(segments), value: op.oldValue, oldValue: op.value, ...extensions };
      }
      case 'move':
        return { op: 'move' as AtomOp, from: op.path, path: op.from!, ...extensions };
      case 'copy':
        return { op: 'remove' as AtomOp, path: op.path, oldValue: op.value, ...extensions };
      /* istanbul ignore next -- exhaustive switch */
      default:
        throw new Error(`Unknown operation: ${op.op}`);
    }
  });

  // Preserve envelope extension properties
  const envelope: IJsonAtom = { format: 'json-atom', version: atom.version, operations: invertedOps };
  for (const key of Object.keys(atom)) {
    if (!['format', 'version', 'operations'].includes(key)) {
      envelope[key] = atom[key];
    }
  }

  return envelope;
}

// ─── applyAtom ─────────────────────────────────────────────────────────────

/** Apply operations sequentially in place; use the return value for root changes. */
export function applyAtom(obj: any, atom: IJsonAtom): any {
  const validation = validateAtom(atom);
  if (!validation.valid) throw new Error(`Invalid atom: ${validation.errors.join(', ')}`);
  return applyAtomOperations(obj, atom);
}

// ─── revertAtom ────────────────────────────────────────────────────────────

/**
 * Revert a JSON Atom by computing its inverse and applying it.
 * Requires all replace/remove operations to have oldValue.
 */
export function revertAtom(obj: any, atom: IJsonAtom): any {
  const inverse = invertAtom(atom);
  return applyAtom(obj, inverse);
}

// ─── Re-exports for convenience ─────────────────────────────────────────────

export { AtomPathSegment, formatFilterLiteral, parseFilterLiteral, parseAtomPath, buildAtomPath } from './atomPath.js';
