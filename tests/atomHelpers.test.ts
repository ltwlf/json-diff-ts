import {
  operationSpecDict,
  operationExtensions,
  atomSpecDict,
  atomExtensions,
  leafProperty,
  atomMap,
  atomStamp,
  atomGroupBy,
  squashAtoms,
} from '../src/atomHelpers';
import { diffAtom, applyAtom, IJsonAtom, IAtomOperation } from '../src/jsonAtom';

// ─── Helpers ────────────────────────────────────────────────────────────────

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function makeAtom(
  operations: IAtomOperation[],
  extras?: Record<string, any>
): IJsonAtom {
  return { format: 'json-atom', version: 1, operations, ...extras };
}

// ─── operationSpecDict ─────────────────────────────────────────────────────

describe('operationSpecDict', () => {
  it('strips extension properties', () => {
    const op: IAtomOperation = {
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
    const op: IAtomOperation = { op: 'add', path: '$.age', value: 30 };
    const result = operationSpecDict(op);
    expect(result).toEqual({ op: 'add', path: '$.age', value: 30 });
    expect('oldValue' in result).toBe(false);
  });

  it('handles remove op (no value)', () => {
    const op: IAtomOperation = { op: 'remove', path: '$.age', oldValue: 30 };
    const result = operationSpecDict(op);
    expect(result).toEqual({ op: 'remove', path: '$.age', oldValue: 30 });
    expect('value' in result).toBe(false);
  });

  it('omits absent keys from result', () => {
    const op: IAtomOperation = { op: 'remove', path: '$.x' };
    const result = operationSpecDict(op);
    expect('value' in result).toBe(false);
    expect('oldValue' in result).toBe(false);
  });
});

// ─── operationExtensions ───────────────────────────────────────────────────

describe('operationExtensions', () => {
  it('returns non-spec keys', () => {
    const op: IAtomOperation = {
      op: 'replace',
      path: '$.name',
      value: 'Bob',
      x_author: 'system',
      x_ts: 123,
    };
    expect(operationExtensions(op)).toEqual({ x_author: 'system', x_ts: 123 });
  });

  it('returns empty object when no extensions', () => {
    const op: IAtomOperation = { op: 'add', path: '$.name', value: 'Bob' };
    expect(operationExtensions(op)).toEqual({});
  });

  it('spec + extensions partition all keys', () => {
    const op: IAtomOperation = {
      op: 'replace',
      path: '$.name',
      value: 'Bob',
      oldValue: 'Alice',
      x_batch: 'b1',
    };
    expect({ ...operationSpecDict(op), ...operationExtensions(op) }).toEqual(op);
  });
});

// ─── atomSpecDict ─────────────────────────────────────────────────────────

describe('atomSpecDict', () => {
  it('strips envelope and operation extensions', () => {
    const atom = makeAtom(
      [{ op: 'replace', path: '$.name', value: 'Bob', x_author: 'sys' }],
      { x_metadata: { ts: 1 } }
    );
    expect(atomSpecDict(atom)).toEqual({
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'replace', path: '$.name', value: 'Bob' }],
    });
  });

  it('preserves spec-only atom as-is', () => {
    const atom = makeAtom([{ op: 'add', path: '$.x', value: 1 }]);
    expect(atomSpecDict(atom)).toEqual(atom);
  });
});

// ─── atomExtensions ───────────────────────────────────────────────────────

describe('atomExtensions', () => {
  it('returns non-spec envelope keys', () => {
    const atom = makeAtom([], { x_source: 'api', x_ts: 42 });
    expect(atomExtensions(atom)).toEqual({ x_source: 'api', x_ts: 42 });
  });

  it('returns empty object when no extensions', () => {
    const atom = makeAtom([]);
    expect(atomExtensions(atom)).toEqual({});
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

// ─── atomMap ──────────────────────────────────────────────────────────────

describe('atomMap', () => {
  it('transforms operations', () => {
    const atom = makeAtom([
      { op: 'replace', path: '$.a', value: 1 },
      { op: 'add', path: '$.b', value: 2 },
    ]);
    const result = atomMap(atom, (op) => ({ ...op, x_mapped: true }));
    expect(result.operations).toHaveLength(2);
    expect(result.operations[0].x_mapped).toBe(true);
    expect(result.operations[1].x_mapped).toBe(true);
  });

  it('preserves envelope properties', () => {
    const atom = makeAtom(
      [{ op: 'add', path: '$.x', value: 1 }],
      { x_source: 'test' }
    );
    const result = atomMap(atom, (op) => op);
    expect(result.x_source).toBe('test');
    expect(result.format).toBe('json-atom');
  });

  it('does not mutate the original atom', () => {
    const atom = makeAtom([{ op: 'add', path: '$.x', value: 1 }]);
    const original = deepClone(atom);
    atomMap(atom, (op) => ({ ...op, x_added: true }));
    expect(atom).toEqual(original);
  });

  it('passes index to callback', () => {
    const atom = makeAtom([
      { op: 'add', path: '$.a', value: 1 },
      { op: 'add', path: '$.b', value: 2 },
    ]);
    const indices: number[] = [];
    atomMap(atom, (op, i) => { indices.push(i); return op; });
    expect(indices).toEqual([0, 1]);
  });
});

// ─── atomStamp ────────────────────────────────────────────────────────────

describe('atomStamp', () => {
  it('sets extensions on all operations', () => {
    const atom = makeAtom([
      { op: 'replace', path: '$.a', value: 1 },
      { op: 'add', path: '$.b', value: 2 },
    ]);
    const result = atomStamp(atom, { x_batch: 'b1', x_ts: 99 });
    for (const op of result.operations) {
      expect(op.x_batch).toBe('b1');
      expect(op.x_ts).toBe(99);
    }
  });

  it('does not mutate the original', () => {
    const atom = makeAtom([{ op: 'add', path: '$.x', value: 1 }]);
    const original = deepClone(atom);
    atomStamp(atom, { x_tag: 'test' });
    expect(atom).toEqual(original);
  });

  it('preserves envelope extensions', () => {
    const atom = makeAtom(
      [{ op: 'add', path: '$.x', value: 1 }],
      { x_source: 'api' }
    );
    const result = atomStamp(atom, { x_tag: 'v1' });
    expect(result.x_source).toBe('api');
  });
});

// ─── atomGroupBy ──────────────────────────────────────────────────────────

describe('atomGroupBy', () => {
  it('groups by operation type', () => {
    const atom = makeAtom([
      { op: 'add', path: '$.a', value: 1 },
      { op: 'replace', path: '$.b', value: 2, oldValue: 1 },
      { op: 'add', path: '$.c', value: 3 },
    ]);
    const groups = atomGroupBy(atom, (op) => op.op);
    expect(Object.keys(groups).sort((a, b) => a.localeCompare(b))).toEqual(['add', 'replace']);
    expect(groups.add.operations).toHaveLength(2);
    expect(groups.replace.operations).toHaveLength(1);
  });

  it('preserves envelope in each sub-atom', () => {
    const atom = makeAtom(
      [
        { op: 'add', path: '$.a', value: 1 },
        { op: 'remove', path: '$.b', oldValue: 2 },
      ],
      { x_source: 'test' }
    );
    const groups = atomGroupBy(atom, (op) => op.op);
    expect(groups.add.format).toBe('json-atom');
    expect(groups.add.version).toBe(1);
    expect(groups.add.x_source).toBe('test');
    expect(groups.remove.x_source).toBe('test');
  });

  it('returns empty record for empty atom', () => {
    const atom = makeAtom([]);
    expect(atomGroupBy(atom, (op) => op.op)).toEqual({});
  });

  it('returns single group when all ops have same key', () => {
    const atom = makeAtom([
      { op: 'add', path: '$.a', value: 1 },
      { op: 'add', path: '$.b', value: 2 },
    ]);
    const groups = atomGroupBy(atom, (op) => op.op);
    expect(Object.keys(groups)).toEqual(['add']);
    expect(groups.add.operations).toHaveLength(2);
  });
});

// ─── squashAtoms ──────────────────────────────────────────────────────────

describe('squashAtoms', () => {
  const source = { name: 'Alice', age: 30, role: 'viewer' };

  it('squashes two successive changes', () => {
    const d1 = diffAtom(source, { ...source, name: 'Bob' });
    const d2 = diffAtom(
      { ...source, name: 'Bob' },
      { ...source, name: 'Bob', role: 'admin' }
    );
    const squashed = squashAtoms(source, [d1, d2]);
    expect(squashed.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: 'replace', path: '$.name', value: 'Bob' }),
        expect.objectContaining({ op: 'replace', path: '$.role', value: 'admin' }),
      ])
    );
  });

  it('cancels add then remove', () => {
    const intermediate = { ...source, newProp: 'hello' };
    const d1 = diffAtom(source, intermediate);
    const d2 = diffAtom(intermediate, source);
    const squashed = squashAtoms(source, [d1, d2]);
    expect(squashed.operations).toHaveLength(0);
  });

  it('handles empty atoms array', () => {
    const squashed = squashAtoms(source, []);
    expect(squashed.operations).toHaveLength(0);
  });

  it('handles single atom', () => {
    const d1 = diffAtom(source, { ...source, age: 31 });
    const squashed = squashAtoms(source, [d1]);
    const applied = applyAtom(deepClone(source), squashed);
    expect(applied).toEqual({ ...source, age: 31 });
  });

  it('works with arrayIdentityKeys', () => {
    const src = { items: [{ id: 1, v: 'a' }, { id: 2, v: 'b' }] };
    const opts = { arrayIdentityKeys: { items: 'id' } };
    const mid = { items: [{ id: 1, v: 'x' }, { id: 2, v: 'b' }] };
    const end = { items: [{ id: 1, v: 'x' }, { id: 2, v: 'y' }] };

    const d1 = diffAtom(src, mid, opts);
    const d2 = diffAtom(mid, end, opts);
    const squashed = squashAtoms(src, [d1, d2], opts);
    const applied = applyAtom(deepClone(src), squashed);
    expect(applied).toEqual(end);
  });

  it('merges envelope extensions (last-wins)', () => {
    const d1 = makeAtom(
      [{ op: 'replace', path: '$.name', value: 'Bob', oldValue: 'Alice' }],
      { x_batch: 'b1', x_source: 'first' }
    );
    const d2 = makeAtom(
      [{ op: 'replace', path: '$.name', value: 'Carol', oldValue: 'Bob' }],
      { x_batch: 'b2' }
    );
    const squashed = squashAtoms(source, [d1, d2]);
    expect(squashed.x_batch).toBe('b2');
    expect(squashed.x_source).toBe('first');
  });

  it('supports direct source→target compaction', () => {
    const target = { ...source, name: 'Zara', age: 99 };
    const squashed = squashAtoms(source, [], { target });
    const applied = applyAtom(deepClone(source), squashed);
    expect(applied).toEqual(target);
  });

  it('verifyTarget throws on mismatch', () => {
    const d1 = diffAtom(source, { ...source, name: 'Bob' });
    const wrongTarget = { ...source, name: 'WRONG' };
    expect(() =>
      squashAtoms(source, [d1], { target: wrongTarget, verifyTarget: true })
    ).toThrow(/does not match/);
  });

  it('verifyTarget false skips check', () => {
    const d1 = diffAtom(source, { ...source, name: 'Bob' });
    const wrongTarget = { ...source, name: 'WRONG' };
    // Should not throw — uses the target as-is
    const squashed = squashAtoms(source, [d1], { target: wrongTarget, verifyTarget: false });
    expect(squashed.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: 'replace', path: '$.name', value: 'WRONG' }),
      ])
    );
  });

  it('reversible false omits oldValue', () => {
    const d1 = diffAtom(source, { ...source, name: 'Bob' });
    const squashed = squashAtoms(source, [d1], { reversible: false });
    for (const op of squashed.operations) {
      expect('oldValue' in op).toBe(false);
    }
  });

  it('round-trip: squash equals sequential apply', () => {
    const mid = { ...source, name: 'Bob', age: 31 };
    const end = { ...source, name: 'Carol', age: 31, role: 'admin' };
    const d1 = diffAtom(source, mid);
    const d2 = diffAtom(mid, end);

    const squashed = squashAtoms(source, [d1, d2]);
    const viaSquash = applyAtom(deepClone(source), squashed);
    const viaSequential = applyAtom(applyAtom(deepClone(source), d1), d2);
    expect(viaSquash).toEqual(viaSequential);
  });
});
