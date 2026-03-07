import {
  diffDelta,
  toDelta,
  fromDelta,
  applyDelta,
  revertDelta,
  invertDelta,
  validateDelta,
  IJsonDelta,
} from '../src/jsonDelta';
import {
  diff,
  atomizeChangeset,
  unatomizeChangeset,
  applyChangeset,
  Operation,
  IAtomicChange,
} from '../src/jsonDiff';
import * as fs from 'fs';
import * as path from 'path';

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadFixture(name: string): any {
  const filePath = path.join(__dirname, '__fixtures__', 'json-delta', `${name}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ─── validateDelta ──────────────────────────────────────────────────────────

describe('validateDelta', () => {
  it('validates a correct delta', () => {
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'replace', path: '$.name', value: 'Bob', oldValue: 'Alice' }],
    };
    expect(validateDelta(delta)).toEqual({ valid: true, errors: [] });
  });

  it('validates delta with x_ extension properties', () => {
    const delta = {
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'replace', path: '$.name', value: 'Bob', x_author: 'system' }],
      x_metadata: { timestamp: 123 },
    };
    expect(validateDelta(delta)).toEqual({ valid: true, errors: [] });
  });

  it('validates delta with empty operations', () => {
    const delta = { format: 'json-delta', version: 1, operations: [] as any[] };
    expect(validateDelta(delta)).toEqual({ valid: true, errors: [] });
  });

  it('rejects missing format', () => {
    const result = validateDelta({ version: 1, operations: [] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/format/);
  });

  it('rejects wrong format', () => {
    const result = validateDelta({ format: 'json-patch', version: 1, operations: [] });
    expect(result.valid).toBe(false);
  });

  it('rejects missing version', () => {
    const result = validateDelta({ format: 'json-delta', operations: [] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/version/);
  });

  it('rejects missing operations', () => {
    const result = validateDelta({ format: 'json-delta', version: 1 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/operations/);
  });

  it('rejects invalid op', () => {
    const result = validateDelta({
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'move', path: '$.x' }],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects add with oldValue', () => {
    const result = validateDelta({
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'add', path: '$.x', value: 1, oldValue: 0 }],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects remove with value', () => {
    const result = validateDelta({
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'remove', path: '$.x', value: 1 }],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects add without value', () => {
    const result = validateDelta({
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'add', path: '$.x' }],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects replace without value', () => {
    const result = validateDelta({
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'replace', path: '$.x', oldValue: 1 }],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects non-object', () => {
    expect(validateDelta(null).valid).toBe(false);
    expect(validateDelta('string').valid).toBe(false);
    expect(validateDelta(42).valid).toBe(false);
  });
});

// ─── diffDelta ──────────────────────────────────────────────────────────────

describe('diffDelta', () => {
  it('produces empty operations for identical objects', () => {
    const obj = { a: 1, b: 'hello' };
    const delta = diffDelta(obj, deepClone(obj));
    expect(delta.format).toBe('json-delta');
    expect(delta.version).toBe(1);
    expect(delta.operations).toEqual([]);
  });

  it('detects simple property replace', () => {
    const delta = diffDelta({ name: 'Alice' }, { name: 'Bob' });
    expect(delta.operations).toEqual([
      { op: 'replace', path: '$.name', value: 'Bob', oldValue: 'Alice' },
    ]);
  });

  it('detects property add', () => {
    const delta = diffDelta({ a: 1 }, { a: 1, b: 2 });
    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0]).toEqual({ op: 'add', path: '$.b', value: 2 });
  });

  it('detects property remove', () => {
    const delta = diffDelta({ a: 1, b: 2 }, { a: 1 });
    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0]).toMatchObject({ op: 'remove', path: '$.b', oldValue: 2 });
  });

  it('handles nested object changes', () => {
    const delta = diffDelta(
      { user: { name: 'Alice', address: { city: 'Portland' } } },
      { user: { name: 'Alice', address: { city: 'Seattle' } } }
    );
    expect(delta.operations).toEqual([
      { op: 'replace', path: '$.user.address.city', value: 'Seattle', oldValue: 'Portland' },
    ]);
  });

  it('handles arrays with $index (default)', () => {
    const delta = diffDelta({ items: [1, 2, 3] }, { items: [1, 2, 4] });
    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0]).toMatchObject({
      op: 'replace',
      path: '$.items[2]',
      value: 4,
      oldValue: 3,
    });
  });

  it('handles arrays with named key (string IDs)', () => {
    const delta = diffDelta(
      { items: [{ id: '1', name: 'Widget' }] },
      { items: [{ id: '1', name: 'Gadget' }] },
      { embeddedObjKeys: { items: 'id' } }
    );
    expect(delta.operations).toEqual([
      { op: 'replace', path: "$.items[?(@.id=='1')].name", value: 'Gadget', oldValue: 'Widget' },
    ]);
  });

  it('handles arrays with named key (numeric IDs) — canonical typed literals', () => {
    const delta = diffDelta(
      { items: [{ id: 1, name: 'Widget' }] },
      { items: [{ id: 1, name: 'Gadget' }] },
      { embeddedObjKeys: { items: 'id' } }
    );
    expect(delta.operations).toEqual([
      { op: 'replace', path: '$.items[?(@.id==1)].name', value: 'Gadget', oldValue: 'Widget' },
    ]);
  });

  it('handles keyed array add and remove', () => {
    const delta = diffDelta(
      { items: [{ id: '1', name: 'Widget' }] },
      { items: [{ id: '1', name: 'Widget' }, { id: '2', name: 'Gadget' }] },
      { embeddedObjKeys: { items: 'id' } }
    );
    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0]).toMatchObject({
      op: 'add',
      path: "$.items[?(@.id=='2')]",
      value: { id: '2', name: 'Gadget' },
    });
  });

  it('handles $value arrays with string values', () => {
    const delta = diffDelta(
      { tags: ['urgent', 'review'] },
      { tags: ['urgent', 'draft'] },
      { embeddedObjKeys: { tags: '$value' } }
    );
    expect(delta.operations).toHaveLength(2);
    // Remove 'review' and add 'draft'
    const removeOp = delta.operations.find(op => op.op === 'remove');
    const addOp = delta.operations.find(op => op.op === 'add');
    expect(removeOp?.path).toBe("$.tags[?(@=='review')]");
    expect(addOp?.path).toBe("$.tags[?(@=='draft')]");
  });

  it('handles $value arrays with numeric values', () => {
    const delta = diffDelta(
      { scores: [10, 20, 30] },
      { scores: [10, 25, 30] },
      { embeddedObjKeys: { scores: '$value' } }
    );
    expect(delta.operations).toHaveLength(2);
    const removeOp = delta.operations.find(op => op.op === 'remove');
    const addOp = delta.operations.find(op => op.op === 'add');
    expect(removeOp?.path).toBe('$.scores[?(@==20)]');
    expect(addOp?.path).toBe('$.scores[?(@==25)]');
  });

  it('type changes produce single replace (not REMOVE+ADD)', () => {
    const delta = diffDelta({ a: 'hello' }, { a: 42 });
    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0]).toMatchObject({
      op: 'replace',
      path: '$.a',
      value: 42,
      oldValue: 'hello',
    });
  });

  it('Object→Array type change produces single replace', () => {
    const delta = diffDelta({ a: { x: 1 } }, { a: [1, 2] });
    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0]).toMatchObject({
      op: 'replace',
      path: '$.a',
      value: [1, 2],
      oldValue: { x: 1 },
    });
  });

  it('Array→Object type change produces single replace', () => {
    const delta = diffDelta({ a: [1, 2] }, { a: { x: 1 } });
    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0]).toMatchObject({
      op: 'replace',
      path: '$.a',
    });
  });

  it('null→Object produces single replace', () => {
    const delta = diffDelta({ a: null }, { a: { x: 1 } });
    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0]).toMatchObject({
      op: 'replace',
      path: '$.a',
      value: { x: 1 },
      oldValue: null,
    });
  });

  it('replace with null value', () => {
    const delta = diffDelta({ a: 42 }, { a: null });
    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0]).toMatchObject({
      op: 'replace',
      path: '$.a',
      value: null,
      oldValue: 42,
    });
  });

  it('omits oldValue when reversible is false', () => {
    const delta = diffDelta({ name: 'Alice' }, { name: 'Bob' }, { reversible: false });
    expect(delta.operations[0]).toEqual({ op: 'replace', path: '$.name', value: 'Bob' });
    expect(delta.operations[0]).not.toHaveProperty('oldValue');
  });

  it('passes keysToSkip through', () => {
    const delta = diffDelta(
      { a: 1, b: 2, c: 3 },
      { a: 10, b: 20, c: 30 },
      { keysToSkip: ['b'] }
    );
    const paths = delta.operations.map(op => op.path);
    expect(paths).toContain('$.a');
    expect(paths).toContain('$.c');
    expect(paths).not.toContain('$.b');
  });

  it('handles function keys with canonical typed literals', () => {
    const delta = diffDelta(
      { items: [{ id: 1, name: 'Widget' }] },
      { items: [{ id: 1, name: 'Gadget' }] },
      {
        embeddedObjKeys: {
          items: ((item: any, returnKeyName?: boolean) =>
            returnKeyName ? 'id' : item.id) as any,
        },
      }
    );
    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0].path).toBe('$.items[?(@.id==1)].name');
  });
});

// ─── toDelta ────────────────────────────────────────────────────────────────

describe('toDelta', () => {
  it('converts hierarchical Changeset to delta', () => {
    const changeset = diff({ name: 'Alice' }, { name: 'Bob' });
    const delta = toDelta(changeset);
    expect(delta.format).toBe('json-delta');
    expect(delta.version).toBe(1);
    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0].op).toBe('replace');
    expect(delta.operations[0].value).toBe('Bob');
  });

  it('converts flat IAtomicChange[] to delta', () => {
    const changeset = diff({ name: 'Alice' }, { name: 'Bob' });
    const atoms = atomizeChangeset(changeset);
    const delta = toDelta(atoms);
    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0].op).toBe('replace');
  });

  it('merges REMOVE+ADD pairs into single replace', () => {
    const changeset = diff({ a: 'hello' }, { a: 42 }, { treatTypeChangeAsReplace: true });
    const delta = toDelta(changeset);
    // Should be a single replace, not separate remove+add
    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0].op).toBe('replace');
    expect(delta.operations[0].value).toBe(42);
  });

  it('canonicalizes paths (bracket quotes)', () => {
    const atoms: IAtomicChange[] = [{
      type: Operation.UPDATE,
      key: 'a.b',
      path: '$[a.b]',
      valueType: 'Number',
      value: 2,
      oldValue: 1,
    }];
    const delta = toDelta(atoms);
    expect(delta.operations[0].path).toBe("$['a.b']");
  });

  it('normalizes root operations ($.$root → $)', () => {
    const atoms: IAtomicChange[] = [{
      type: Operation.UPDATE,
      key: '$root',
      path: '$.$root',
      valueType: 'String',
      value: 'new',
      oldValue: 'old',
    }];
    const delta = toDelta(atoms);
    expect(delta.operations[0].path).toBe('$');
  });

  it('handles empty changeset', () => {
    const delta = toDelta([]);
    expect(delta.operations).toEqual([]);
  });
});

// ─── fromDelta ──────────────────────────────────────────────────────────────

describe('fromDelta', () => {
  it('returns IAtomicChange[] with correct 1:1 mapping', () => {
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [
        { op: 'replace', path: '$.name', value: 'Bob', oldValue: 'Alice' },
        { op: 'add', path: '$.age', value: 30 },
      ],
    };
    const atoms = fromDelta(delta);
    expect(atoms).toHaveLength(2);
    expect(atoms[0].type).toBe(Operation.UPDATE);
    expect(atoms[0].key).toBe('name');
    expect(atoms[0].path).toBe('$.name');
    expect(atoms[0].value).toBe('Bob');
    expect(atoms[0].oldValue).toBe('Alice');
    expect(atoms[1].type).toBe(Operation.ADD);
    expect(atoms[1].key).toBe('age');
    expect(atoms[1].value).toBe(30);
  });

  it('converts remove op correctly (oldValue → value)', () => {
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'remove', path: '$.x', oldValue: 42 }],
    };
    const atoms = fromDelta(delta);
    expect(atoms[0].type).toBe(Operation.REMOVE);
    expect(atoms[0].value).toBe(42);
  });

  it('normalizes root path ($ → $.$root)', () => {
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'replace', path: '$', value: { new: true }, oldValue: { old: true } }],
    };
    const atoms = fromDelta(delta);
    expect(atoms[0].path).toBe('$.$root');
    expect(atoms[0].key).toBe('$root');
  });

  it('normalizes non-string filter literals to string-quoted', () => {
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'replace', path: '$.items[?(@.id==42)].name', value: 'X', oldValue: 'Y' }],
    };
    const atoms = fromDelta(delta);
    expect(atoms[0].path).toBe("$.items[?(@.id=='42')].name");
  });

  it('round-trips: diffDelta → fromDelta → unatomize → applyChangeset', () => {
    const source = { name: 'Alice', age: 30, active: true };
    const target = { name: 'Bob', age: 30, active: false };
    const delta = diffDelta(source, target);
    const atoms = fromDelta(delta);
    const changeset = unatomizeChangeset(atoms);
    const result = deepClone(source);
    applyChangeset(result, changeset);
    expect(result).toEqual(target);
  });

  it('derives valueType from value', () => {
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [
        { op: 'add', path: '$.s', value: 'hello' },
        { op: 'add', path: '$.n', value: 42 },
        { op: 'add', path: '$.b', value: true },
        { op: 'add', path: '$.o', value: { x: 1 } },
        { op: 'add', path: '$.a', value: [1, 2] },
        { op: 'add', path: '$.null', value: null },
      ],
    };
    const atoms = fromDelta(delta);
    expect(atoms[0].valueType).toBe('String');
    expect(atoms[1].valueType).toBe('Number');
    expect(atoms[2].valueType).toBe('Boolean');
    expect(atoms[3].valueType).toBe('Object');
    expect(atoms[4].valueType).toBe('Array');
    expect(atoms[5].valueType).toBe(null);
  });

  it('throws on invalid delta', () => {
    expect(() => fromDelta({ format: 'wrong' } as any)).toThrow(/Invalid delta/);
  });
});

// ─── applyDelta ─────────────────────────────────────────────────────────────

describe('applyDelta', () => {
  it('applies simple property changes', () => {
    const obj = { name: 'Alice', age: 30 };
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [
        { op: 'replace', path: '$.name', value: 'Bob', oldValue: 'Alice' },
      ],
    };
    const result = applyDelta(obj, delta);
    expect(result).toEqual({ name: 'Bob', age: 30 });
  });

  it('applies add and remove', () => {
    const obj = { a: 1, b: 2 };
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [
        { op: 'remove', path: '$.b', oldValue: 2 },
        { op: 'add', path: '$.c', value: 3 },
      ],
    };
    const result = applyDelta(obj, delta);
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('applies keyed array operations', () => {
    const obj = {
      items: [
        { id: '1', name: 'Widget', price: 10 },
        { id: '2', name: 'Gadget', price: 20 },
      ],
    };
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [
        { op: 'replace', path: "$.items[?(@.id=='1')].name", value: 'Widget Pro', oldValue: 'Widget' },
      ],
    };
    const result = applyDelta(obj, delta);
    expect(result.items[0].name).toBe('Widget Pro');
  });

  it('applies root add (from null)', () => {
    const result = applyDelta(null, {
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'add', path: '$', value: { hello: 'world' } }],
    });
    expect(result).toEqual({ hello: 'world' });
  });

  it('applies root remove (to null)', () => {
    const result = applyDelta({ hello: 'world' }, {
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'remove', path: '$', oldValue: { hello: 'world' } }],
    });
    expect(result).toBe(null);
  });

  it('applies root replace', () => {
    const result = applyDelta(
      { old: true },
      {
        format: 'json-delta',
        version: 1,
        operations: [{ op: 'replace', path: '$', value: { new: true }, oldValue: { old: true } }],
      }
    );
    expect(result).toEqual({ new: true });
  });

  it('root replace with primitive returns new value', () => {
    const result = applyDelta(
      'old',
      {
        format: 'json-delta',
        version: 1,
        operations: [{ op: 'replace', path: '$', value: 'new', oldValue: 'old' }],
      }
    );
    expect(result).toBe('new');
  });

  it('throws on invalid delta', () => {
    expect(() => applyDelta({}, { format: 'wrong' } as any)).toThrow();
  });

  it('applies operations sequentially (order matters)', () => {
    const obj = { items: ['a', 'b', 'c'] };
    // Remove index 1, then the array becomes ['a', 'c']
    // Then replace index 1 (which is now 'c') with 'd'
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [
        { op: 'remove', path: '$.items[1]', oldValue: 'b' },
        { op: 'replace', path: '$.items[1]', value: 'd', oldValue: 'c' },
      ],
    };
    const result = applyDelta(obj, delta);
    expect(result.items).toEqual(['a', 'd']);
  });
});

// ─── revertDelta ────────────────────────────────────────────────────────────

describe('revertDelta', () => {
  it('full round-trip: source → applyDelta → revertDelta == source', () => {
    const source = { name: 'Alice', age: 30, tags: ['admin'] };
    const target = { name: 'Bob', age: 31, tags: ['admin', 'user'] };
    const delta = diffDelta(source, target, { embeddedObjKeys: { tags: '$value' } });

    const applied = applyDelta(deepClone(source), delta);
    expect(applied).toEqual(target);

    const reverted = revertDelta(deepClone(applied), delta);
    expect(reverted).toEqual(source);
  });

  it('throws on non-reversible delta (missing oldValue)', () => {
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'replace', path: '$.name', value: 'Bob' }],
    };
    expect(() => revertDelta({ name: 'Alice' }, delta)).toThrow(/not reversible/);
  });
});

// ─── invertDelta ────────────────────────────────────────────────────────────

describe('invertDelta', () => {
  it('inverts add → remove', () => {
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'add', path: '$.x', value: 42 }],
    };
    const inverse = invertDelta(delta);
    expect(inverse.operations).toEqual([{ op: 'remove', path: '$.x', oldValue: 42 }]);
  });

  it('inverts remove → add', () => {
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'remove', path: '$.x', oldValue: 42 }],
    };
    const inverse = invertDelta(delta);
    expect(inverse.operations).toEqual([{ op: 'add', path: '$.x', value: 42 }]);
  });

  it('inverts replace (swaps value and oldValue)', () => {
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'replace', path: '$.name', value: 'Bob', oldValue: 'Alice' }],
    };
    const inverse = invertDelta(delta);
    expect(inverse.operations).toEqual([
      { op: 'replace', path: '$.name', value: 'Alice', oldValue: 'Bob' },
    ]);
  });

  it('reverses operation order', () => {
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [
        { op: 'add', path: '$.a', value: 1 },
        { op: 'add', path: '$.b', value: 2 },
      ],
    };
    const inverse = invertDelta(delta);
    expect(inverse.operations[0].path).toBe('$.b');
    expect(inverse.operations[1].path).toBe('$.a');
  });

  it('throws when replace missing oldValue', () => {
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'replace', path: '$.x', value: 42 }],
    };
    expect(() => invertDelta(delta)).toThrow(/not reversible/);
  });

  it('throws when remove missing oldValue', () => {
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'remove', path: '$.x' }],
    };
    expect(() => invertDelta(delta)).toThrow(/not reversible/);
  });

  it('preserves envelope extension properties', () => {
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'add', path: '$.x', value: 1 }],
      x_source: 'test',
    };
    const inverse = invertDelta(delta);
    expect(inverse.x_source).toBe('test');
    expect(inverse.format).toBe('json-delta');
  });

  it('preserves operation-level extension properties', () => {
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'add', path: '$.x', value: 1, x_author: 'alice' }],
    };
    const inverse = invertDelta(delta);
    expect(inverse.operations[0].x_author).toBe('alice');
  });
});

// ─── Extension property preservation ────────────────────────────────────────

describe('extension property preservation', () => {
  it('applyDelta ignores extension properties without error', () => {
    const delta: IJsonDelta = {
      format: 'json-delta',
      version: 1,
      operations: [{ op: 'replace', path: '$.name', value: 'Bob', oldValue: 'Alice', x_reason: 'rename' }],
      x_metadata: { ts: 123 },
    };
    const result = applyDelta({ name: 'Alice' }, delta);
    expect(result).toEqual({ name: 'Bob' });
  });
});

// ─── Conformance Fixtures ───────────────────────────────────────────────────

describe('conformance fixtures', () => {
  describe('basic-replace', () => {
    const fixture = loadFixture('basic-replace');

    it('Level 1: applyDelta(source, delta) == target', () => {
      const result = applyDelta(deepClone(fixture.source), fixture.delta);
      expect(result).toEqual(fixture.target);
    });

    it('Level 2: applyDelta(target, inverse(delta)) == source', () => {
      const inverse = invertDelta(fixture.delta);
      const result = applyDelta(deepClone(fixture.target), inverse);
      expect(result).toEqual(fixture.source);
    });

    it('diffDelta produces equivalent delta (verified by apply)', () => {
      const computed = diffDelta(fixture.source, fixture.target);
      const result = applyDelta(deepClone(fixture.source), computed);
      expect(result).toEqual(fixture.target);
    });
  });

  describe('keyed-array-update', () => {
    const fixture = loadFixture('keyed-array-update');

    it('Level 1: applyDelta(source, delta) == target', () => {
      const result = applyDelta(deepClone(fixture.source), fixture.delta);
      expect(result).toEqual(fixture.target);
    });

    it('Level 2: applyDelta(target, inverse(delta)) == source', () => {
      const inverse = invertDelta(fixture.delta);
      const result = applyDelta(deepClone(fixture.target), inverse);
      expect(result).toEqual(fixture.source);
    });

    it('diffDelta produces equivalent delta (verified by apply)', () => {
      const opts = {
        embeddedObjKeys: fixture.computeHints?.arrayKeys || {},
      };
      const computed = diffDelta(fixture.source, fixture.target, opts);
      const result = applyDelta(deepClone(fixture.source), computed);
      expect(result).toEqual(fixture.target);
    });
  });
});

// ─── Integration: full round-trip scenarios ─────────────────────────────────

describe('integration round-trips', () => {
  it('nested objects with add/remove/replace', () => {
    const source = {
      user: { name: 'Alice', age: 30 },
      settings: { theme: 'light', lang: 'en' },
    };
    const target = {
      user: { name: 'Bob', age: 31 },
      settings: { theme: 'dark' },
      newField: true,
    };
    const delta = diffDelta(source, target);
    expect(applyDelta(deepClone(source), delta)).toEqual(target);
    expect(revertDelta(deepClone(target), delta)).toEqual(source);
  });

  it('keyed arrays with deep property changes', () => {
    const source = {
      items: [
        { id: 1, name: 'Widget', details: { color: 'red' } },
        { id: 2, name: 'Gadget', details: { color: 'blue' } },
      ],
    };
    const target = {
      items: [
        { id: 1, name: 'Widget', details: { color: 'green' } },
        { id: 2, name: 'Gadget', details: { color: 'blue' } },
      ],
    };
    const delta = diffDelta(source, target, { embeddedObjKeys: { items: 'id' } });
    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0].path).toBe('$.items[?(@.id==1)].details.color');
    expect(applyDelta(deepClone(source), delta)).toEqual(target);
    expect(revertDelta(deepClone(target), delta)).toEqual(source);
  });

  it('toDelta bridge: diff → toDelta → applyDelta', () => {
    const source = { a: 1, b: 'hello' };
    const target = { a: 2, b: 'world', c: true };
    const changeset = diff(source, target);
    const delta = toDelta(changeset);
    expect(applyDelta(deepClone(source), delta)).toEqual(target);
  });

  it('fromDelta bridge: diffDelta → fromDelta → unatomize → apply', () => {
    const source = { x: 10, y: 20 };
    const target = { x: 10, y: 30, z: 40 };
    const delta = diffDelta(source, target);
    const atoms = fromDelta(delta);
    const changeset = unatomizeChangeset(atoms);
    const result = deepClone(source);
    applyChangeset(result, changeset);
    expect(result).toEqual(target);
  });
});
