import { parseAtomPath } from './atomPath.js';
import { diffAtom, applyAtom } from './jsonAtom.js';
import type { IAtomOperation, IJsonAtom, AtomOptions } from './jsonAtom.js';

// ─── Constants ─────────────────────────────────────────────────────────────

const OP_SPEC_KEYS = new Set(['op', 'path', 'value', 'oldValue']);
const ATOM_SPEC_KEYS = new Set(['format', 'version', 'operations']);

// ─── Operation Helpers ─────────────────────────────────────────────────────

/**
 * Returns a copy of the operation containing only spec-defined keys
 * (`op`, `path`, `value`, `oldValue`). Complement of `operationExtensions`.
 */
export function operationSpecDict(op: IAtomOperation): IAtomOperation {
  const result: IAtomOperation = { op: op.op, path: op.path };
  if ('value' in op) result.value = op.value;
  if ('oldValue' in op) result.oldValue = op.oldValue;
  return result;
}

/**
 * Returns a record of non-spec keys from the operation (extension properties).
 * Complement of `operationSpecDict`.
 */
export function operationExtensions(op: IAtomOperation): Record<string, any> {
  const result: Record<string, any> = Object.create(null);
  for (const key of Object.keys(op)) {
    if (!OP_SPEC_KEYS.has(key)) {
      result[key] = op[key];
    }
  }
  return result;
}

/**
 * Returns the terminal property name from the operation's path, or `null`
 * for root, index, and filter segments.
 */
export function leafProperty(op: IAtomOperation): string | null {
  const segments = parseAtomPath(op.path);
  if (segments.length === 0) return null;
  const last = segments[segments.length - 1];
  return last.type === 'property' ? last.name : null;
}

// ─── Atom Helpers ─────────────────────────────────────────────────────────

/**
 * Returns a copy of the atom with only spec-defined keys in the envelope
 * and each operation. Strips all extension properties.
 */
export function atomSpecDict(atom: IJsonAtom): IJsonAtom {
  return {
    format: atom.format,
    version: atom.version,
    operations: atom.operations.map(operationSpecDict),
  };
}

/**
 * Returns a record of non-spec keys from the atom envelope.
 * Complement of `atomSpecDict`.
 */
export function atomExtensions(atom: IJsonAtom): Record<string, any> {
  const result: Record<string, any> = Object.create(null);
  for (const key of Object.keys(atom)) {
    if (!ATOM_SPEC_KEYS.has(key)) {
      result[key] = atom[key];
    }
  }
  return result;
}

/**
 * Transforms each operation in the atom using the provided function.
 * Returns a new atom (immutable). Preserves all envelope properties.
 */
export function atomMap(
  atom: IJsonAtom,
  fn: (op: IAtomOperation, index: number) => IAtomOperation
): IJsonAtom {
  return { ...atom, operations: atom.operations.map((op, i) => fn(op, i)) };
}

/**
 * Returns a new atom with the given extension properties merged onto every
 * operation. Immutable — the original atom is not modified.
 */
export function atomStamp(
  atom: IJsonAtom,
  extensions: Record<string, any>
): IJsonAtom {
  return atomMap(atom, (op) => ({ ...op, ...extensions }));
}

/**
 * Groups operations in the atom by the result of `keyFn`. Returns a record
 * mapping each key to a sub-atom containing only the matching operations.
 * Each sub-atom preserves all envelope properties.
 */
export function atomGroupBy(
  atom: IJsonAtom,
  keyFn: (op: IAtomOperation) => string
): Record<string, IJsonAtom> {
  const groups: Record<string, IAtomOperation[]> = Object.create(null);
  for (const op of atom.operations) {
    const k = keyFn(op);
    if (!groups[k]) groups[k] = [];
    groups[k].push(op);
  }

  // Build envelope without operations
  const envelope: Record<string, any> = Object.create(null);
  for (const key of Object.keys(atom)) {
    if (key !== 'operations') {
      envelope[key] = atom[key];
    }
  }

  const result: Record<string, IJsonAtom> = Object.create(null);
  for (const [k, ops] of Object.entries(groups)) {
    result[k] = { ...envelope, operations: ops } as IJsonAtom;
  }
  return result;
}

// ─── Squash ────────────────────────────────────────────────────────────────

export interface SquashAtomsOptions extends AtomOptions {
  /** Pre-computed final state. When provided with atoms, used instead of computing. */
  target?: any;
  /** Verify that `target` matches sequential application of atoms. Default: true. */
  verifyTarget?: boolean;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Compacts multiple atoms into a single net-effect atom. The result is
 * equivalent to applying all atoms sequentially, but expressed as a single
 * `source → final` diff.
 *
 * Envelope extensions from all input atoms are merged (last-wins on conflict).
 */
export function squashAtoms(
  source: any,
  atoms: IJsonAtom[],
  options: SquashAtomsOptions = {}
): IJsonAtom {
  const { target, verifyTarget = true, ...diffOptions } = options;

  let final: any;

  if (target !== undefined && atoms.length > 0 && verifyTarget) {
    // Compute and verify
    let computed = deepClone(source);
    for (const d of atoms) {
      computed = applyAtom(computed, d);
    }
    const verification = diffAtom(computed, target, diffOptions);
    if (verification.operations.length > 0) {
      throw new Error(
        'squashAtoms: provided target does not match sequential application of atoms to source'
      );
    }
    final = target;
  } else if (target !== undefined) {
    // Trust the provided target
    final = target;
  } else {
    // Compute final by applying all atoms
    final = deepClone(source);
    for (const d of atoms) {
      final = applyAtom(final, d);
    }
  }

  // Compute the net-effect atom
  const result = diffAtom(source, final, diffOptions);

  // Merge envelope extensions from input atoms (last-wins)
  for (const d of atoms) {
    for (const key of Object.keys(d)) {
      if (!ATOM_SPEC_KEYS.has(key)) {
        Object.defineProperty(result, key, {
          value: d[key],
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    }
  }

  return result;
}
