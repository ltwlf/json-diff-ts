import { parseDeltaPath } from './deltaPath.js';
import { diffDelta, applyDelta } from './jsonDelta.js';
import type { IDeltaOperation, IJsonDelta, DeltaOptions } from './jsonDelta.js';

// ─── Constants ─────────────────────────────────────────────────────────────

const OP_SPEC_KEYS = new Set(['op', 'path', 'value', 'oldValue']);
const DELTA_SPEC_KEYS = new Set(['format', 'version', 'operations']);

// ─── Operation Helpers ─────────────────────────────────────────────────────

/**
 * Returns a copy of the operation containing only spec-defined keys
 * (`op`, `path`, `value`, `oldValue`). Complement of `operationExtensions`.
 */
export function operationSpecDict(op: IDeltaOperation): IDeltaOperation {
  const result: IDeltaOperation = { op: op.op, path: op.path };
  if ('value' in op) result.value = op.value;
  if ('oldValue' in op) result.oldValue = op.oldValue;
  return result;
}

/**
 * Returns a record of non-spec keys from the operation (extension properties).
 * Complement of `operationSpecDict`.
 */
export function operationExtensions(op: IDeltaOperation): Record<string, any> {
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
export function leafProperty(op: IDeltaOperation): string | null {
  const segments = parseDeltaPath(op.path);
  if (segments.length === 0) return null;
  const last = segments[segments.length - 1];
  return last.type === 'property' ? last.name : null;
}

// ─── Delta Helpers ─────────────────────────────────────────────────────────

/**
 * Returns a copy of the delta with only spec-defined keys in the envelope
 * and each operation. Strips all extension properties.
 */
export function deltaSpecDict(delta: IJsonDelta): IJsonDelta {
  return {
    format: delta.format,
    version: delta.version,
    operations: delta.operations.map(operationSpecDict),
  };
}

/**
 * Returns a record of non-spec keys from the delta envelope.
 * Complement of `deltaSpecDict`.
 */
export function deltaExtensions(delta: IJsonDelta): Record<string, any> {
  const result: Record<string, any> = Object.create(null);
  for (const key of Object.keys(delta)) {
    if (!DELTA_SPEC_KEYS.has(key)) {
      result[key] = delta[key];
    }
  }
  return result;
}

/**
 * Transforms each operation in the delta using the provided function.
 * Returns a new delta (immutable). Preserves all envelope properties.
 */
export function deltaMap(
  delta: IJsonDelta,
  fn: (op: IDeltaOperation, index: number) => IDeltaOperation
): IJsonDelta {
  return { ...delta, operations: delta.operations.map((op, i) => fn(op, i)) };
}

/**
 * Returns a new delta with the given extension properties merged onto every
 * operation. Immutable — the original delta is not modified.
 */
export function deltaStamp(
  delta: IJsonDelta,
  extensions: Record<string, any>
): IJsonDelta {
  return deltaMap(delta, (op) => ({ ...op, ...extensions }));
}

/**
 * Groups operations in the delta by the result of `keyFn`. Returns a record
 * mapping each key to a sub-delta containing only the matching operations.
 * Each sub-delta preserves all envelope properties.
 */
export function deltaGroupBy(
  delta: IJsonDelta,
  keyFn: (op: IDeltaOperation) => string
): Record<string, IJsonDelta> {
  const groups: Record<string, IDeltaOperation[]> = Object.create(null);
  for (const op of delta.operations) {
    const k = keyFn(op);
    if (!groups[k]) groups[k] = [];
    groups[k].push(op);
  }

  // Build envelope without operations
  const envelope: Record<string, any> = {};
  for (const key of Object.keys(delta)) {
    if (key !== 'operations') {
      envelope[key] = delta[key];
    }
  }

  const result: Record<string, IJsonDelta> = Object.create(null);
  for (const [k, ops] of Object.entries(groups)) {
    result[k] = { ...envelope, operations: ops } as IJsonDelta;
  }
  return result;
}

// ─── Squash ────────────────────────────────────────────────────────────────

export interface SquashDeltasOptions extends DeltaOptions {
  /** Pre-computed final state. When provided with deltas, used instead of computing. */
  target?: any;
  /** Verify that `target` matches sequential application of deltas. Default: true. */
  verifyTarget?: boolean;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Compacts multiple deltas into a single net-effect delta. The result is
 * equivalent to applying all deltas sequentially, but expressed as a single
 * `source → final` diff.
 *
 * Envelope extensions from all input deltas are merged (last-wins on conflict).
 */
export function squashDeltas(
  source: any,
  deltas: IJsonDelta[],
  options: SquashDeltasOptions = {}
): IJsonDelta {
  const { target, verifyTarget = true, ...diffOptions } = options;

  let final: any;

  if (target !== undefined && deltas.length > 0 && verifyTarget) {
    // Compute and verify
    let computed = deepClone(source);
    for (const d of deltas) {
      computed = applyDelta(computed, d);
    }
    const verification = diffDelta(computed, target, diffOptions);
    if (verification.operations.length > 0) {
      throw new Error(
        'squashDeltas: provided target does not match sequential application of deltas to source'
      );
    }
    final = target;
  } else if (target !== undefined) {
    // Trust the provided target
    final = target;
  } else {
    // Compute final by applying all deltas
    final = deepClone(source);
    for (const d of deltas) {
      final = applyDelta(final, d);
    }
  }

  // Compute the net-effect delta
  const result = diffDelta(source, final, diffOptions);

  // Merge envelope extensions from input deltas (last-wins)
  for (const d of deltas) {
    for (const key of Object.keys(d)) {
      if (!DELTA_SPEC_KEYS.has(key)) {
        result[key] = d[key];
      }
    }
  }

  return result;
}
