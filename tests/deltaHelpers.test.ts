import {
  operationSpecDict,
  operationExtensions,
  deltaSpecDict,
  deltaExtensions,
  leafProperty,
  deltaMap,
  deltaStamp,
  deltaGroupBy,
  squashDeltas,
} from '../src/deltaHelpers';
import { diffDelta, applyDelta, IJsonDelta, IDeltaOperation } from '../src/jsonDelta';

// ─── Helpers ────────────────────────────────────────────────────────────────

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function makeDelta(
  operations: IDeltaOperation[],
  extras?: Record<string, any>
): IJsonDelta {
  return { format: 'json-delta', version: 1, operations, ...extras };
}

// ─── operationSpecDict ─────────────────────────────────────────────────────

describe('operationSpecDict', () => {
  it('strips extension properties', () => {
    const op: IDeltaOperation = {
      op: 'replace',
      path: '$.name',
      value: 'Bob',
      oldValue: 'Alice',
      x_author: 'system',
      x_ts: 123,
    };
    expect(operationSpecDict(op)).toEqual({
      op: 'replace',
      path: '$.name',
      value: 'Bob',
      oldValue: 'Alice',
    });
  });

  it('handles add op (no oldValue)', () => {
    const op: IDeltaOperation = { op: 'add', path: '$.age', value: 30 };
    const result = operationSpecDict(op);
    expect(result).toEqual({ op: 'add', path: '$.age', value: 30 });
    expect('oldValue' in result).toBe(false);
  });

  it('handles remove op (no value)', () => {
    const op: IDeltaOperation = { op: 'remove', path: '$.age', oldValue: 30 };
    const result = operationSpecDict(op);
    expect(result).toEqual({ op: 'remove', path: '$.age', oldValue: 30 });
    expect('value' in result).toBe(false);
  });

  it('omits absent keys from result', () => {
    const op: IDeltaOperation = { op: 'remove', path: '$.x' };
    const result = operationSpecDict(op);
    expect('value' in result).toBe(false);
    expect('oldValue' in result).toBe(false);
  });
});

// ─── operationExtensions ───────────────────────────────────────────────────

describe('operationExtensions', () => {
  it('returns non-spec keys', () => {
    const op: IDeltaOperation = {
      op: 'replace',
      path: '$.name',
      value: 'Bob',
      x_author: 'system',
      x_ts: 123,
    };
    expect(operationExtensions(op)).toEqual({ x_author: 'system', x_ts: 123 });
  });

  it('returns empty object when no extensions', () => {
    const op: IDeltaOperation = { op: 'add', path: '$.name', value: 'Bob' };
    expect(operationExtensions(op)).toEqual({});
  });

  it('spec + extensions partition all keys', () => {
    const op: IDeltaOperation = {
      op: 'replace',
      path: '$.name',
      value: 'Bob',
      oldValue: 'Alice',
      x_batch: 'b1',
    };
    expect({ ...operationSpecDict(op), ...operationExtensions(op) }).toEqual(op);
  });
});

// ─── deltaSpecDict ─────────────────────────────────────────────────────────

describe('deltaSpecDict', () => {
  it('strips envelope and operation extensions', () => {
    const delta = makeDelta(
      [{ op: 'replace', path: '$.name', value: 'Bob', x_author: 'sys' }],
      { x_metadata: { ts: 1 } }
    );
    expect(deltaSpecDict(delta)).toEqual({
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'replace', path: '$.name', value: 'Bob' }],
    });
  });

  it('preserves spec-only delta as-is', () => {
    const delta = makeDelta([{ op: 'add', path: '$.x', value: 1 }]);
    expect(deltaSpecDict(delta)).toEqual(delta);
  });
});

// ─── deltaExtensions ───────────────────────────────────────────────────────

describe('deltaExtensions', () => {
  it('returns non-spec envelope keys', () => {
    const delta = makeDelta([], { x_source: 'api', x_ts: 42 });
    expect(deltaExtensions(delta)).toEqual({ x_source: 'api', x_ts: 42 });
  });

  it('returns empty object when no extensions', () => {
    const delta = makeDelta([]);
    expect(deltaExtensions(delta)).toEqual({});
  });
});

// ─── leafProperty ──────────────────────────────────────────────────────────

describe('leafProperty', () => {
  it('returns property name for simple path', () => {
    expect(leafProperty({ op: 'replace', path: '$.user.name' })).toBe('name');
  });

  it('returns null for root path', () => {
    expect(leafProperty({ op: 'replace', path: '$' })).toBeNull();
  });

  it('returns null for index segment', () => {
    expect(leafProperty({ op: 'replace', path: '$.items[0]' })).toBeNull();
  });

  it('returns null for filter segment', () => {
    expect(leafProperty({ op: 'replace', path: '$.items[?(@.id==1)]' })).toBeNull();
  });

  it('returns property after filter segment', () => {
    expect(leafProperty({ op: 'replace', path: "$.items[?(@.id==1)].name" })).toBe('name');
  });

  it('returns property for single-level path', () => {
    expect(leafProperty({ op: 'add', path: '$.age' })).toBe('age');
  });
});

// ─── deltaMap ──────────────────────────────────────────────────────────────

describe('deltaMap', () => {
  it('transforms operations', () => {
    const delta = makeDelta([
      { op: 'replace', path: '$.a', value: 1 },
      { op: 'add', path: '$.b', value: 2 },
    ]);
    const result = deltaMap(delta, (op) => ({ ...op, x_mapped: true }));
    expect(result.operations).toHaveLength(2);
    expect(result.operations[0].x_mapped).toBe(true);
    expect(result.operations[1].x_mapped).toBe(true);
  });

  it('preserves envelope properties', () => {
    const delta = makeDelta(
      [{ op: 'add', path: '$.x', value: 1 }],
      { x_source: 'test' }
    );
    const result = deltaMap(delta, (op) => op);
    expect(result.x_source).toBe('test');
    expect(result.format).toBe('json-delta');
  });

  it('does not mutate the original delta', () => {
    const delta = makeDelta([{ op: 'add', path: '$.x', value: 1 }]);
    const original = deepClone(delta);
    deltaMap(delta, (op) => ({ ...op, x_added: true }));
    expect(delta).toEqual(original);
  });

  it('passes index to callback', () => {
    const delta = makeDelta([
      { op: 'add', path: '$.a', value: 1 },
      { op: 'add', path: '$.b', value: 2 },
    ]);
    const indices: number[] = [];
    deltaMap(delta, (op, i) => { indices.push(i); return op; });
    expect(indices).toEqual([0, 1]);
  });
});

// ─── deltaStamp ────────────────────────────────────────────────────────────

describe('deltaStamp', () => {
  it('sets extensions on all operations', () => {
    const delta = makeDelta([
      { op: 'replace', path: '$.a', value: 1 },
      { op: 'add', path: '$.b', value: 2 },
    ]);
    const result = deltaStamp(delta, { x_batch: 'b1', x_ts: 99 });
    for (const op of result.operations) {
      expect(op.x_batch).toBe('b1');
      expect(op.x_ts).toBe(99);
    }
  });

  it('does not mutate the original', () => {
    const delta = makeDelta([{ op: 'add', path: '$.x', value: 1 }]);
    const original = deepClone(delta);
    deltaStamp(delta, { x_tag: 'test' });
    expect(delta).toEqual(original);
  });

  it('preserves envelope extensions', () => {
    const delta = makeDelta(
      [{ op: 'add', path: '$.x', value: 1 }],
      { x_source: 'api' }
    );
    const result = deltaStamp(delta, { x_tag: 'v1' });
    expect(result.x_source).toBe('api');
  });
});

// ─── deltaGroupBy ──────────────────────────────────────────────────────────

describe('deltaGroupBy', () => {
  it('groups by operation type', () => {
    const delta = makeDelta([
      { op: 'add', path: '$.a', value: 1 },
      { op: 'replace', path: '$.b', value: 2, oldValue: 1 },
      { op: 'add', path: '$.c', value: 3 },
    ]);
    const groups = deltaGroupBy(delta, (op) => op.op);
    expect(Object.keys(groups).sort()).toEqual(['add', 'replace']);
    expect(groups.add.operations).toHaveLength(2);
    expect(groups.replace.operations).toHaveLength(1);
  });

  it('preserves envelope in each sub-delta', () => {
    const delta = makeDelta(
      [
        { op: 'add', path: '$.a', value: 1 },
        { op: 'remove', path: '$.b', oldValue: 2 },
      ],
      { x_source: 'test' }
    );
    const groups = deltaGroupBy(delta, (op) => op.op);
    expect(groups.add.format).toBe('json-delta');
    expect(groups.add.version).toBe(1);
    expect(groups.add.x_source).toBe('test');
    expect(groups.remove.x_source).toBe('test');
  });

  it('returns empty record for empty delta', () => {
    const delta = makeDelta([]);
    expect(deltaGroupBy(delta, (op) => op.op)).toEqual({});
  });

  it('returns single group when all ops have same key', () => {
    const delta = makeDelta([
      { op: 'add', path: '$.a', value: 1 },
      { op: 'add', path: '$.b', value: 2 },
    ]);
    const groups = deltaGroupBy(delta, (op) => op.op);
    expect(Object.keys(groups)).toEqual(['add']);
    expect(groups.add.operations).toHaveLength(2);
  });
});

// ─── squashDeltas ──────────────────────────────────────────────────────────

describe('squashDeltas', () => {
  const source = { name: 'Alice', age: 30, role: 'viewer' };

  it('squashes two successive changes', () => {
    const d1 = diffDelta(source, { ...source, name: 'Bob' });
    const d2 = diffDelta(
      { ...source, name: 'Bob' },
      { ...source, name: 'Bob', role: 'admin' }
    );
    const squashed = squashDeltas(source, [d1, d2]);
    expect(squashed.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: 'replace', path: '$.name', value: 'Bob' }),
        expect.objectContaining({ op: 'replace', path: '$.role', value: 'admin' }),
      ])
    );
  });

  it('cancels add then remove', () => {
    const intermediate = { ...source, newProp: 'hello' };
    const d1 = diffDelta(source, intermediate);
    const d2 = diffDelta(intermediate, source);
    const squashed = squashDeltas(source, [d1, d2]);
    expect(squashed.operations).toHaveLength(0);
  });

  it('handles empty deltas array', () => {
    const squashed = squashDeltas(source, []);
    expect(squashed.operations).toHaveLength(0);
  });

  it('handles single delta', () => {
    const d1 = diffDelta(source, { ...source, age: 31 });
    const squashed = squashDeltas(source, [d1]);
    const applied = applyDelta(deepClone(source), squashed);
    expect(applied).toEqual({ ...source, age: 31 });
  });

  it('works with arrayIdentityKeys', () => {
    const src = { items: [{ id: 1, v: 'a' }, { id: 2, v: 'b' }] };
    const opts = { arrayIdentityKeys: { items: 'id' } };
    const mid = { items: [{ id: 1, v: 'x' }, { id: 2, v: 'b' }] };
    const end = { items: [{ id: 1, v: 'x' }, { id: 2, v: 'y' }] };

    const d1 = diffDelta(src, mid, opts);
    const d2 = diffDelta(mid, end, opts);
    const squashed = squashDeltas(src, [d1, d2], opts);
    const applied = applyDelta(deepClone(src), squashed);
    expect(applied).toEqual(end);
  });

  it('merges envelope extensions (last-wins)', () => {
    const d1 = makeDelta(
      [{ op: 'replace', path: '$.name', value: 'Bob', oldValue: 'Alice' }],
      { x_batch: 'b1', x_source: 'first' }
    );
    const d2 = makeDelta(
      [{ op: 'replace', path: '$.name', value: 'Carol', oldValue: 'Bob' }],
      { x_batch: 'b2' }
    );
    const squashed = squashDeltas(source, [d1, d2]);
    expect(squashed.x_batch).toBe('b2');
    expect(squashed.x_source).toBe('first');
  });

  it('supports direct source→target compaction', () => {
    const target = { ...source, name: 'Zara', age: 99 };
    const squashed = squashDeltas(source, [], { target });
    const applied = applyDelta(deepClone(source), squashed);
    expect(applied).toEqual(target);
  });

  it('verifyTarget throws on mismatch', () => {
    const d1 = diffDelta(source, { ...source, name: 'Bob' });
    const wrongTarget = { ...source, name: 'WRONG' };
    expect(() =>
      squashDeltas(source, [d1], { target: wrongTarget, verifyTarget: true })
    ).toThrow(/does not match/);
  });

  it('verifyTarget false skips check', () => {
    const d1 = diffDelta(source, { ...source, name: 'Bob' });
    const wrongTarget = { ...source, name: 'WRONG' };
    // Should not throw — uses the target as-is
    const squashed = squashDeltas(source, [d1], { target: wrongTarget, verifyTarget: false });
    expect(squashed.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: 'replace', path: '$.name', value: 'WRONG' }),
      ])
    );
  });

  it('reversible false omits oldValue', () => {
    const d1 = diffDelta(source, { ...source, name: 'Bob' });
    const squashed = squashDeltas(source, [d1], { reversible: false });
    for (const op of squashed.operations) {
      expect('oldValue' in op).toBe(false);
    }
  });

  it('round-trip: squash equals sequential apply', () => {
    const mid = { ...source, name: 'Bob', age: 31 };
    const end = { ...source, name: 'Carol', age: 31, role: 'admin' };
    const d1 = diffDelta(source, mid);
    const d2 = diffDelta(mid, end);

    const squashed = squashDeltas(source, [d1, d2]);
    const viaSquash = applyDelta(deepClone(source), squashed);
    const viaSequential = applyDelta(applyDelta(deepClone(source), d1), d2);
    expect(viaSquash).toEqual(viaSequential);
  });
});
