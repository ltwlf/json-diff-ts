import { parseAtomPath, AtomPathSegment } from './atomPath.js';
import type { IAtomOperation, IJsonAtom } from './jsonAtom.js';

type Selector = Exclude<AtomPathSegment, { type: 'root' }>;
type Filter = Extract<Selector, { type: 'keyFilter' | 'valueFilter' }>;

const owns = (obj: any, key: string | number): boolean =>
  obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);

function filterValue(item: any, filter: Filter): any {
  if (filter.type === 'valueFilter') return item;
  const keys = filter.memberPath ?? (filter.literalKey ? [filter.property] : filter.property.split('.'));
  return keys.reduce((value, key) => owns(value, key) ? value[key] : undefined, item);
}

function locate(parent: any, segment: Selector, adding = false): string | number {
  if (segment.type === 'property') {
    if (parent === null || typeof parent !== 'object' || Array.isArray(parent)) {
      throw new Error(`Cannot access property '${segment.name}' on non-object`);
    }
    const exists = owns(parent, segment.name);
    if (adding ? exists : !exists) throw new Error(`Property '${segment.name}' ${exists ? 'already exists' : 'does not exist'}`);
    return segment.name;
  }
  if (!Array.isArray(parent)) {
    const names = { index: 'access index', keyFilter: 'apply key filter', valueFilter: 'apply value filter' };
    throw new Error(`Cannot ${names[segment.type]} on non-array`);
  }
  if (segment.type === 'index') {
    const limit = adding ? parent.length : parent.length - 1;
    if (segment.index > limit) throw new Error(`Array index ${segment.index} is out of bounds`);
    return segment.index;
  }
  const matches = parent.flatMap((item, index) => filterValue(item, segment) === segment.value ? [index] : []);
  if (matches.length > 1) throw new Error('Array filter matches multiple elements');
  if (adding) {
    if (matches.length) throw new Error('Array filter target already exists');
    return parent.length;
  }
  if (!matches.length) throw new Error('Array filter does not match an element');
  return matches[0];
}

function resolve(obj: any, segments: Selector[]): any {
  return segments.reduce((current, segment) => current[locate(current, segment)], obj);
}

function selectors(path: string): Selector[] {
  return parseAtomPath(path).slice(1) as Selector[];
}

function setOwn(obj: any, key: string | number, value: any): void {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
}

function applyValue(obj: any, op: IAtomOperation): any {
  const segments = selectors(op.path);
  if (segments.length === 0) {
    if (op.op === 'add' && obj !== null) throw new Error('Root add requires a null source');
    if (op.op !== 'add' && obj === null) throw new Error('Root remove/replace requires a non-null source');
    if (op.op === 'remove') return null;
    const value = structuredClone(op.value);
    if (op.op === 'replace' && obj && value && typeof obj === 'object' && typeof value === 'object'
      && !Array.isArray(obj) && !Array.isArray(value)) {
      for (const key of Object.keys(obj)) delete obj[key];
      for (const key of Object.keys(value)) setOwn(obj, key, value[key]);
      return obj;
    }
    return value;
  }
  const last = segments.at(-1)!;
  const parent = resolve(obj, segments.slice(0, -1));
  const key = locate(parent, last, op.op === 'add');
  if (op.op !== 'remove' && last.type === 'keyFilter' && filterValue(op.value, last) !== last.value) {
    throw new Error('Keyed-array value does not match its identity filter');
  }
  if (op.op === 'add' && last.type === 'valueFilter' && op.value !== last.value) {
    throw new Error('Added value does not match its value filter');
  }
  if (op.op === 'remove') {
    if (Array.isArray(parent)) parent.splice(Number(key), 1);
    else delete parent[key];
  } else {
    const value = structuredClone(op.value);
    if (Array.isArray(parent) && op.op === 'add') parent.splice(Number(key), 0, value);
    else setOwn(parent, key, value);
  }
  return obj;
}

/** Apply validated operations with typed selectors and own-property traversal. */
export function applyAtomOperations(obj: any, atom: IJsonAtom): any {
  let result = obj;
  for (const op of atom.operations) {
    if (op.op === 'move' || op.op === 'copy') {
      const value = resolve(result, selectors(op.from!));
      const add: IAtomOperation = { op: 'add', path: op.path, value };
      if (op.op === 'move') {
        const remove: IAtomOperation = { op: 'remove', path: op.from! };
        // Validate the destination against the state after removal before mutating
        // the caller's document. A failed move must not lose its source.
        const probe = applyValue(structuredClone(result), remove);
        applyValue(probe, add);
        result = applyValue(result, remove);
      }
      result = applyValue(result, add);
    } else {
      result = applyValue(result, op);
    }
  }
  return result;
}
