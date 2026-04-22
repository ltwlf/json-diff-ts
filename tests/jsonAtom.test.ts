import {
  diffAtom,
  toAtom,
  fromAtom,
  applyAtom,
  revertAtom,
  invertAtom,
  validateAtom,
  IJsonAtom,
} from '../src/jsonAtom';
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
  const filePath = path.join(__dirname, '__fixtures__', 'json-atom', `${name}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ─── validateAtom ──────────────────────────────────────────────────────────

describe('validateAtom', () => {
  it('validates a correct atom', () => {
    const atom: IJsonAtom = {
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'replace', path: '$.name', value: 'Bob', oldValue: 'Alice' }],
    };
    expect(validateAtom(atom)).toEqual({ valid: true, errors: [] });
  });

  it('validates atom with x_ extension properties', () => {
    const atom = {
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'replace', path: '$.name', value: 'Bob', x_author: 'system' }],
      x_metadata: { timestamp: 123 },
    };
    expect(validateAtom(atom)).toEqual({ valid: true, errors: [] });
  });

  it('validates atom with empty operations', () => {
    const atom = { format: 'json-atom', version: 1, operations: [] as any[] };
    expect(validateAtom(atom)).toEqual({ valid: true, errors: [] });
  });

  it('rejects missing format', () => {
    const result = validateAtom({ version: 1, operations: [] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/format/);
  });

  it('rejects wrong format', () => {
    const result = validateAtom({ format: 'json-patch', version: 1, operations: [] });
    expect(result.valid).toBe(false);
  });

  it('rejects missing version', () => {
    const result = validateAtom({ format: 'json-atom', operations: [] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/version/);
  });

  it('rejects missing operations', () => {
    const result = validateAtom({ format: 'json-atom', version: 1 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/operations/);
  });

  it('rejects invalid op', () => {
    const result = validateAtom({
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'patch', path: '$.x' }],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects add with oldValue', () => {
    const result = validateAtom({
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'add', path: '$.x', value: 1, oldValue: 0 }],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects remove with value', () => {
    const result = validateAtom({
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'remove', path: '$.x', value: 1 }],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects add without value', () => {
    const result = validateAtom({
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'add', path: '$.x' }],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects replace without value', () => {
    const result = validateAtom({
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'replace', path: '$.x', oldValue: 1 }],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects non-object', () => {
    expect(validateAtom(null).valid).toBe(false);
    expect(validateAtom('string').valid).toBe(false);
    expect(validateAtom(42).valid).toBe(false);
  });

  it('rejects non-object operation entries', () => {
    const result = validateAtom({
      format: 'json-atom',
      version: 1,
      operations: [null, 'not-an-object'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/must be an object/);
  });

  it('rejects operation with non-string path', () => {
    const result = validateAtom({
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'add', path: 123, value: 'x' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/path must be a string/);
  });
});

// ─── diffAtom ──────────────────────────────────────────────────────────────

describe('diffAtom', () => {
  it('produces empty operations for identical objects', () => {
    const obj = { a: 1, b: 'hello' };
    const atom = diffAtom(obj, deepClone(obj));
    expect(atom.format).toBe('json-atom');
    expect(atom.version).toBe(1);
    expect(atom.operations).toEqual([]);
  });

  it('detects simple property replace', () => {
    const atom = diffAtom({ name: 'Alice' }, { name: 'Bob' });
    expect(atom.operations).toEqual([
      { op: 'replace', path: '$.name', value: 'Bob', oldValue: 'Alice' },
    ]);
  });

  it('detects property add', () => {
    const atom = diffAtom({ a: 1 }, { a: 1, b: 2 });
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0]).toEqual({ op: 'add', path: '$.b', value: 2 });
  });

  it('detects property remove', () => {
    const atom = diffAtom({ a: 1, b: 2 }, { a: 1 });
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0]).toMatchObject({ op: 'remove', path: '$.b', oldValue: 2 });
  });

  it('handles nested object changes', () => {
    const atom = diffAtom(
      { user: { name: 'Alice', address: { city: 'Portland' } } },
      { user: { name: 'Alice', address: { city: 'Seattle' } } }
    );
    expect(atom.operations).toEqual([
      { op: 'replace', path: '$.user.address.city', value: 'Seattle', oldValue: 'Portland' },
    ]);
  });

  it('handles arrays with $index (default)', () => {
    const atom = diffAtom({ items: [1, 2, 3] }, { items: [1, 2, 4] });
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0]).toMatchObject({
      op: 'replace',
      path: '$.items[2]',
      value: 4,
      oldValue: 3,
    });
  });

  it('applies multiple index-based removes correctly without identity keys (#404)', () => {
    const oldObj = {
      bankAccounts: [
        { iban: 'DE12345678901234567890', bic: 'BIC123456' },
        { iban: 'DE23456789012345678901', bic: 'BIC234567' },
        { iban: 'DE23456789012345678902', bic: 'BIC234567' },
      ],
    };
    const newObj = {
      bankAccounts: [{ iban: 'DE11456789012345678999', bic: 'BIC123456' }],
    };

    const atom = diffAtom(oldObj, newObj);
    expect(atom.operations).toEqual([
      {
        op: 'replace',
        path: '$.bankAccounts[0].iban',
        oldValue: 'DE12345678901234567890',
        value: 'DE11456789012345678999',
      },
      {
        op: 'remove',
        path: '$.bankAccounts[2]',
        oldValue: { iban: 'DE23456789012345678902', bic: 'BIC234567' },
      },
      {
        op: 'remove',
        path: '$.bankAccounts[1]',
        oldValue: { iban: 'DE23456789012345678901', bic: 'BIC234567' },
      },
    ]);

    const applied = applyAtom(structuredClone(oldObj), atom);
    expect(applied).toEqual(newObj);
  });

  it('emits index-based remove operations in descending order for nested arrays', () => {
    const oldObj = { items: [1, 2, 3, 4] };
    const newObj = { items: [1] };

    const atom = diffAtom(oldObj, newObj);
    const removeIndices = atom.operations
      .filter((op) => op.op === 'remove')
      .map((op) => Number(op.path.match(/\[(\d+)\]$/)?.[1]));

    expect(removeIndices.length).toBeGreaterThanOrEqual(2);
    expect(removeIndices).toEqual([...removeIndices].sort((a, b) => b - a));

    const applied = applyAtom(structuredClone(oldObj), atom);
    expect(applied).toEqual(newObj);
  });

  it('keeps non-remove operations while sorting multiple index removes descending', () => {
    const oldObj = { items: ['a', 'b', 'c', 'd'] };
    const newObj = { items: ['z', 'b'] };

    const atom = diffAtom(oldObj, newObj);
    const removeIndices = atom.operations
      .filter((op) => op.op === 'remove')
      .map((op) => Number(op.path.match(/\[(\d+)\]$/)?.[1]));

    expect(atom.operations.some((op) => op.op === 'replace')).toBe(true);
    expect(removeIndices.length).toBeGreaterThanOrEqual(2);
    expect(removeIndices).toEqual([...removeIndices].sort((a, b) => b - a));

    const applied = applyAtom(structuredClone(oldObj), atom);
    expect(applied).toEqual(newObj);
  });

  it('keeps index type-change REMOVE+ADD pairs in order while still applying correctly', () => {
    const oldObj = { items: [1, 2, 3, 4] };
    const newObj = { items: ['x', 2] };

    const atom = diffAtom(oldObj, newObj);
    expect(applyAtom(structuredClone(oldObj), atom)).toEqual(newObj);

    // Ensure pure removes (excluding paired type-change REMOVE+ADD at same index) stay descending.
    const addIndices = new Set(
      atom.operations
        .filter((op) => op.op === 'add')
        .map((op) => Number(op.path.match(/\[(\d+)\]$/)?.[1]))
    );
    const pureRemoveIndices = atom.operations
      .filter((op) => op.op === 'remove')
      .map((op) => Number(op.path.match(/\[(\d+)\]$/)?.[1]))
      .filter((idx) => !addIndices.has(idx));

    expect(pureRemoveIndices).toEqual([...pureRemoveIndices].sort((a, b) => b - a));
  });

  it('preserves same-index REMOVE+ADD pairs for pure index type changes (P1 badge case)', () => {
    const oldObj = { a: [1, 2] };
    const newObj = { a: [[1], [2]] };

    const atom = diffAtom(oldObj, newObj);
    const applied = applyAtom(structuredClone(oldObj), atom);

    expect(applied).toEqual(newObj);
    expect(atom.operations).toEqual([
      { op: 'remove', path: '$.a[0]', oldValue: 1 },
      { op: 'add', path: '$.a[0]', value: [1] },
      { op: 'remove', path: '$.a[1]', oldValue: 2 },
      { op: 'add', path: '$.a[1]', value: [2] },
    ]);
  });

  it('handles arrays with named key (string IDs)', () => {
    const atom = diffAtom(
      { items: [{ id: '1', name: 'Widget' }] },
      { items: [{ id: '1', name: 'Gadget' }] },
      { embeddedObjKeys: { items: 'id' } }
    );
    expect(atom.operations).toEqual([
      { op: 'replace', path: "$.items[?(@.id=='1')].name", value: 'Gadget', oldValue: 'Widget' },
    ]);
  });

  it('handles arrays with named key (numeric IDs) — canonical typed literals', () => {
    const atom = diffAtom(
      { items: [{ id: 1, name: 'Widget' }] },
      { items: [{ id: 1, name: 'Gadget' }] },
      { embeddedObjKeys: { items: 'id' } }
    );
    expect(atom.operations).toEqual([
      { op: 'replace', path: '$.items[?(@.id==1)].name', value: 'Gadget', oldValue: 'Widget' },
    ]);
  });

  it('handles keyed array add and remove', () => {
    const atom = diffAtom(
      { items: [{ id: '1', name: 'Widget' }] },
      { items: [{ id: '1', name: 'Widget' }, { id: '2', name: 'Gadget' }] },
      { embeddedObjKeys: { items: 'id' } }
    );
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0]).toMatchObject({
      op: 'add',
      path: "$.items[?(@.id=='2')]",
      value: { id: '2', name: 'Gadget' },
    });
  });

  it('handles $value arrays with string values', () => {
    const atom = diffAtom(
      { tags: ['urgent', 'review'] },
      { tags: ['urgent', 'draft'] },
      { embeddedObjKeys: { tags: '$value' } }
    );
    expect(atom.operations).toHaveLength(2);
    // Remove 'review' and add 'draft'
    const removeOp = atom.operations.find(op => op.op === 'remove');
    const addOp = atom.operations.find(op => op.op === 'add');
    expect(removeOp?.path).toBe("$.tags[?(@=='review')]");
    expect(addOp?.path).toBe("$.tags[?(@=='draft')]");
  });

  it('handles $value arrays with numeric values', () => {
    const atom = diffAtom(
      { scores: [10, 20, 30] },
      { scores: [10, 25, 30] },
      { embeddedObjKeys: { scores: '$value' } }
    );
    expect(atom.operations).toHaveLength(2);
    const removeOp = atom.operations.find(op => op.op === 'remove');
    const addOp = atom.operations.find(op => op.op === 'add');
    expect(removeOp?.path).toBe('$.scores[?(@==20)]');
    expect(addOp?.path).toBe('$.scores[?(@==25)]');
  });

  it('type changes produce single replace (not REMOVE+ADD)', () => {
    const atom = diffAtom({ a: 'hello' }, { a: 42 });
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0]).toMatchObject({
      op: 'replace',
      path: '$.a',
      value: 42,
      oldValue: 'hello',
    });
  });

  it('Object→Array type change produces single replace', () => {
    const atom = diffAtom({ a: { x: 1 } }, { a: [1, 2] });
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0]).toMatchObject({
      op: 'replace',
      path: '$.a',
      value: [1, 2],
      oldValue: { x: 1 },
    });
  });

  it('Array→Object type change produces single replace', () => {
    const atom = diffAtom({ a: [1, 2] }, { a: { x: 1 } });
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0]).toMatchObject({
      op: 'replace',
      path: '$.a',
    });
  });

  it('null→Object produces single replace', () => {
    const atom = diffAtom({ a: null }, { a: { x: 1 } });
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0]).toMatchObject({
      op: 'replace',
      path: '$.a',
      value: { x: 1 },
      oldValue: null,
    });
  });

  it('replace with null value', () => {
    const atom = diffAtom({ a: 42 }, { a: null });
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0]).toMatchObject({
      op: 'replace',
      path: '$.a',
      value: null,
      oldValue: 42,
    });
  });

  it('omits oldValue when reversible is false', () => {
    const atom = diffAtom({ name: 'Alice' }, { name: 'Bob' }, { reversible: false });
    expect(atom.operations[0]).toEqual({ op: 'replace', path: '$.name', value: 'Bob' });
    expect(atom.operations[0]).not.toHaveProperty('oldValue');
  });

  it('passes keysToSkip through', () => {
    const atom = diffAtom(
      { a: 1, b: 2, c: 3 },
      { a: 10, b: 20, c: 30 },
      { keysToSkip: ['b'] }
    );
    const paths = atom.operations.map(op => op.path);
    expect(paths).toContain('$.a');
    expect(paths).toContain('$.c');
    expect(paths).not.toContain('$.b');
  });

  it('handles function keys with canonical typed literals', () => {
    const atom = diffAtom(
      { items: [{ id: 1, name: 'Widget' }] },
      { items: [{ id: 1, name: 'Gadget' }] },
      {
        embeddedObjKeys: {
          items: ((item: any, returnKeyName?: boolean) =>
            returnKeyName ? 'id' : item.id) as any,
        },
      }
    );
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0].path).toBe('$.items[?(@.id==1)].name');
  });

  it('handles function keys with add operations', () => {
    const atom = diffAtom(
      { items: [{ id: 1, name: 'Widget' }] },
      { items: [{ id: 1, name: 'Widget' }, { id: 2, name: 'Gadget' }] },
      {
        embeddedObjKeys: {
          items: ((item: any, returnKeyName?: boolean) =>
            returnKeyName ? 'id' : item.id) as any,
        },
      }
    );
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0].op).toBe('add');
    expect(atom.operations[0].path).toBe('$.items[?(@.id==2)]');
  });

  it('handles function keys with remove operations', () => {
    const atom = diffAtom(
      { items: [{ id: 1, name: 'Widget' }, { id: 2, name: 'Gadget' }] },
      { items: [{ id: 1, name: 'Widget' }] },
      {
        embeddedObjKeys: {
          items: ((item: any, returnKeyName?: boolean) =>
            returnKeyName ? 'id' : item.id) as any,
        },
      }
    );
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0].op).toBe('remove');
    expect(atom.operations[0].path).toBe('$.items[?(@.id==2)]');
  });

  it('diffAtom with nested identity path uses dot notation (#392)', () => {
    const oldObj = {
      items: [
        { positionNumber: { value: '001' }, description: 'alpha' },
        { positionNumber: { value: '002' }, description: 'beta' },
      ],
    };
    const newObj = {
      items: [
        { positionNumber: { value: '001' }, description: 'alpha' },
        { positionNumber: { value: '003' }, description: 'gamma' },
      ],
    };

    const changes = diffAtom(oldObj, newObj, {
      arrayIdentityKeys: {
        items: ((obj: any, shouldReturnKeyName?: boolean) => {
          if (shouldReturnKeyName) return 'positionNumber.value';
          return obj.positionNumber.value;
        }) as any,
      },
    });

    expect(changes.operations.length).toBe(2);
    const removes = changes.operations.filter((c) => c.op === 'remove');
    expect(removes).toHaveLength(1);
    expect(removes[0].path).toBe("$.items[?(@.positionNumber.value=='002')]");
    const adds = changes.operations.filter((c) => c.op === 'add');
    expect(adds).toHaveLength(1);
    expect(adds[0].path).toBe("$.items[?(@.positionNumber.value=='003')]");
  });

  it('diffAtom with nested identity path — update within element (#392)', () => {
    const oldObj = {
      items: [
        { positionNumber: { value: '001' }, description: 'alpha' },
        { positionNumber: { value: '002' }, description: 'beta' },
      ],
    };
    const newObj = {
      items: [
        { positionNumber: { value: '001' }, description: 'alpha' },
        { positionNumber: { value: '002' }, description: 'updated' },
      ],
    };

    const changes = diffAtom(oldObj, newObj, {
      arrayIdentityKeys: {
        items: ((obj: any, shouldReturnKeyName?: boolean) => {
          if (shouldReturnKeyName) return 'positionNumber.value';
          return obj.positionNumber.value;
        }) as any,
      },
    });

    expect(changes.operations).toHaveLength(1);
    expect(changes.operations[0]).toMatchObject({
      op: 'replace',
      path: "$.items[?(@.positionNumber.value=='002')].description",
      value: 'updated',
      oldValue: 'beta',
    });
  });

  it('diffAtom → applyAtom full round-trip with nested identity path (#392)', () => {
    const oldObj = {
      items: [
        { positionNumber: { value: '001' }, description: 'alpha' },
        { positionNumber: { value: '002' }, description: 'beta' },
      ],
    };
    const newObj = {
      items: [
        { positionNumber: { value: '001' }, description: 'alpha' },
        { positionNumber: { value: '003' }, description: 'gamma' },
      ],
    };

    const identityKey = ((obj: any, shouldReturnKeyName?: boolean) => {
      if (shouldReturnKeyName) return 'positionNumber.value';
      return obj.positionNumber.value;
    }) as any;

    const atom = diffAtom(oldObj, newObj, { arrayIdentityKeys: { items: identityKey } });
    const result = applyAtom(JSON.parse(JSON.stringify(oldObj)), atom);
    expect(result).toEqual(newObj);
  });

  it('diffAtom → applyAtom → revertAtom round-trip with nested identity path (#392)', () => {
    const oldObj = {
      items: [
        { positionNumber: { value: '001' }, description: 'alpha' },
        { positionNumber: { value: '002' }, description: 'beta' },
      ],
    };
    const newObj = {
      items: [
        { positionNumber: { value: '001' }, description: 'alpha' },
        { positionNumber: { value: '002' }, description: 'updated' },
      ],
    };

    const identityKey = ((obj: any, shouldReturnKeyName?: boolean) => {
      if (shouldReturnKeyName) return 'positionNumber.value';
      return obj.positionNumber.value;
    }) as any;

    const atom = diffAtom(oldObj, newObj, { arrayIdentityKeys: { items: identityKey } });
    const applied = applyAtom(JSON.parse(JSON.stringify(oldObj)), atom);
    expect(applied).toEqual(newObj);
    const reverted = revertAtom(JSON.parse(JSON.stringify(applied)), atom);
    expect(reverted).toEqual(oldObj);
  });

  it('diffAtom with string-based nested identity key (not function) (#392)', () => {
    const oldObj = {
      items: [
        { positionNumber: { value: '001' }, description: 'alpha' },
        { positionNumber: { value: '002' }, description: 'beta' },
      ],
    };
    const newObj = {
      items: [
        { positionNumber: { value: '001' }, description: 'alpha' },
      ],
    };

    const atom = diffAtom(oldObj, newObj, {
      embeddedObjKeys: { items: 'positionNumber.value' },
    });
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0].op).toBe('remove');
    expect(atom.operations[0].path).toBe("$.items[?(@.positionNumber.value=='002')]");

    // Round-trip
    const result = applyAtom(JSON.parse(JSON.stringify(oldObj)), atom);
    expect(result).toEqual(newObj);
  });

  it('diffAtom with 3-level nested identity path (a.b.c)', () => {
    const oldObj = {
      items: [
        { meta: { org: { id: 'X' } }, val: 10 },
        { meta: { org: { id: 'Y' } }, val: 20 },
      ],
    };
    const newObj = {
      items: [
        { meta: { org: { id: 'X' } }, val: 10 },
        { meta: { org: { id: 'Y' } }, val: 30 },
      ],
    };

    const identityKey = ((obj: any, shouldReturnKeyName?: boolean) => {
      if (shouldReturnKeyName) return 'meta.org.id';
      return obj.meta.org.id;
    }) as any;

    const atom = diffAtom(oldObj, newObj, { arrayIdentityKeys: { items: identityKey } });
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0].path).toBe("$.items[?(@.meta.org.id=='Y')].val");

    // Round-trip
    const result = applyAtom(JSON.parse(JSON.stringify(oldObj)), atom);
    expect(result).toEqual(newObj);
    const reverted = revertAtom(JSON.parse(JSON.stringify(result)), atom);
    expect(reverted).toEqual(oldObj);
  });

  it('diffAtom with nested identity path — numeric value', () => {
    const oldObj = {
      items: [
        { code: { num: 1 }, name: 'Widget' },
        { code: { num: 2 }, name: 'Gadget' },
      ],
    };
    const newObj = {
      items: [
        { code: { num: 1 }, name: 'Widget' },
        { code: { num: 2 }, name: 'Updated' },
      ],
    };

    const identityKey = ((obj: any, shouldReturnKeyName?: boolean) => {
      if (shouldReturnKeyName) return 'code.num';
      return obj.code.num;
    }) as any;

    const atom = diffAtom(oldObj, newObj, { arrayIdentityKeys: { items: identityKey } });
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0].path).toBe('$.items[?(@.code.num==2)].name');

    const result = applyAtom(JSON.parse(JSON.stringify(oldObj)), atom);
    expect(result).toEqual(newObj);
  });

  it('diffAtom with nested identity path — boolean value', () => {
    const oldObj = {
      items: [
        { config: { active: true }, label: 'on' },
        { config: { active: false }, label: 'off' },
      ],
    };
    const newObj = {
      items: [
        { config: { active: true }, label: 'on' },
        { config: { active: false }, label: 'disabled' },
      ],
    };

    const identityKey = ((obj: any, shouldReturnKeyName?: boolean) => {
      if (shouldReturnKeyName) return 'config.active';
      return obj.config.active;
    }) as any;

    const atom = diffAtom(oldObj, newObj, { arrayIdentityKeys: { items: identityKey } });
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0].path).toBe('$.items[?(@.config.active==false)].label');

    const result = applyAtom(JSON.parse(JSON.stringify(oldObj)), atom);
    expect(result).toEqual(newObj);
  });

  it('diffAtom with nested identity path — null value', () => {
    const oldObj = {
      items: [
        { status: { code: null }, label: 'pending' },
        { status: { code: 'OK' }, label: 'done' },
      ],
    };
    const newObj = {
      items: [
        { status: { code: null }, label: 'waiting' },
        { status: { code: 'OK' }, label: 'done' },
      ],
    };

    const identityKey = ((obj: any, shouldReturnKeyName?: boolean) => {
      if (shouldReturnKeyName) return 'status.code';
      return obj.status.code;
    }) as any;

    const atom = diffAtom(oldObj, newObj, { arrayIdentityKeys: { items: identityKey } });
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0].path).toBe('$.items[?(@.status.code==null)].label');

    const result = applyAtom(JSON.parse(JSON.stringify(oldObj)), atom);
    expect(result).toEqual(newObj);
  });

  it('toAtom bridge with nested identity paths', () => {
    const oldObj = {
      items: [
        { positionNumber: { value: '001' }, description: 'alpha' },
        { positionNumber: { value: '002' }, description: 'beta' },
      ],
    };
    const newObj = {
      items: [
        { positionNumber: { value: '001' }, description: 'alpha' },
        { positionNumber: { value: '002' }, description: 'updated' },
      ],
    };

    const identityKey = ((obj: any, shouldReturnKeyName?: boolean) => {
      if (shouldReturnKeyName) return 'positionNumber.value';
      return obj.positionNumber.value;
    }) as any;

    const changeset = diff(oldObj, newObj, { arrayIdentityKeys: { items: identityKey } });
    const atom = toAtom(changeset);
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0].path).toContain('positionNumber.value');

    // Apply via atom path
    const result = applyAtom(JSON.parse(JSON.stringify(oldObj)), atom);
    expect(result).toEqual(newObj);
  });

  it('handles nested property names with dots (bracket notation)', () => {
    const atom = diffAtom(
      { 'a.b': 1 },
      { 'a.b': 2 }
    );
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0].path).toBe("$['a.b']");
  });

  it('handles deep path in $index arrays', () => {
    const atom = diffAtom(
      { items: [{ name: 'Widget', color: 'red' }] },
      { items: [{ name: 'Widget', color: 'blue' }] }
    );
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0].path).toBe('$.items[0].color');
  });
});

// ─── toAtom ────────────────────────────────────────────────────────────────

describe('toAtom', () => {
  it('converts hierarchical Changeset to atom', () => {
    const changeset = diff({ name: 'Alice' }, { name: 'Bob' });
    const atom = toAtom(changeset);
    expect(atom.format).toBe('json-atom');
    expect(atom.version).toBe(1);
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0].op).toBe('replace');
    expect(atom.operations[0].value).toBe('Bob');
  });

  it('converts flat IAtomicChange[] to atom', () => {
    const changeset = diff({ name: 'Alice' }, { name: 'Bob' });
    const atoms = atomizeChangeset(changeset);
    const atom = toAtom(atoms);
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0].op).toBe('replace');
  });

  it('merges REMOVE+ADD pairs into single replace', () => {
    const changeset = diff({ a: 'hello' }, { a: 42 }, { treatTypeChangeAsReplace: true });
    const atom = toAtom(changeset);
    // Should be a single replace, not separate remove+add
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0].op).toBe('replace');
    expect(atom.operations[0].value).toBe(42);
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
    const atom = toAtom(atoms);
    expect(atom.operations[0].path).toBe("$['a.b']");
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
    const atom = toAtom(atoms);
    expect(atom.operations[0].path).toBe('$');
  });

  it('handles empty changeset', () => {
    const atom = toAtom([]);
    expect(atom.operations).toEqual([]);
  });
});

// ─── fromAtom ──────────────────────────────────────────────────────────────

describe('fromAtom', () => {
  it('returns IAtomicChange[] with correct 1:1 mapping', () => {
    const atom: IJsonAtom = {
      format: 'json-atom',
      version: 1,
      operations: [
        { op: 'replace', path: '$.name', value: 'Bob', oldValue: 'Alice' },
        { op: 'add', path: '$.age', value: 30 },
      ],
    };
    const atoms = fromAtom(atom);
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
    const atom: IJsonAtom = {
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'remove', path: '$.x', oldValue: 42 }],
    };
    const atoms = fromAtom(atom);
    expect(atoms[0].type).toBe(Operation.REMOVE);
    expect(atoms[0].value).toBe(42);
  });

  it('normalizes root path ($ → $.$root)', () => {
    const atom: IJsonAtom = {
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'replace', path: '$', value: { new: true }, oldValue: { old: true } }],
    };
    const atoms = fromAtom(atom);
    expect(atoms[0].path).toBe('$.$root');
    expect(atoms[0].key).toBe('$root');
  });

  it('normalizes non-string filter literals to string-quoted', () => {
    const atom: IJsonAtom = {
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'replace', path: '$.items[?(@.id==42)].name', value: 'X', oldValue: 'Y' }],
    };
    const atoms = fromAtom(atom);
    expect(atoms[0].path).toBe("$.items[?(@.id=='42')].name");
  });

  it('round-trips: diffAtom → fromAtom → unatomize → applyChangeset', () => {
    const source = { name: 'Alice', age: 30, active: true };
    const target = { name: 'Bob', age: 30, active: false };
    const atom = diffAtom(source, target);
    const atoms = fromAtom(atom);
    const changeset = unatomizeChangeset(atoms);
    const result = deepClone(source);
    applyChangeset(result, changeset);
    expect(result).toEqual(target);
  });

  it('derives valueType from value', () => {
    const atom: IJsonAtom = {
      format: 'json-atom',
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
    const atoms = fromAtom(atom);
    expect(atoms[0].valueType).toBe('String');
    expect(atoms[1].valueType).toBe('Number');
    expect(atoms[2].valueType).toBe('Boolean');
    expect(atoms[3].valueType).toBe('Object');
    expect(atoms[4].valueType).toBe('Array');
    expect(atoms[5].valueType).toBe(null);
  });

  it('throws on invalid atom', () => {
    expect(() => fromAtom({ format: 'wrong' } as any)).toThrow(/Invalid atom/);
  });
});

// ─── applyAtom ─────────────────────────────────────────────────────────────

describe('applyAtom', () => {
  it('applies simple property changes', () => {
    const obj = { name: 'Alice', age: 30 };
    const atom: IJsonAtom = {
      format: 'json-atom',
      version: 1,
      operations: [
        { op: 'replace', path: '$.name', value: 'Bob', oldValue: 'Alice' },
      ],
    };
    const result = applyAtom(obj, atom);
    expect(result).toEqual({ name: 'Bob', age: 30 });
  });

  it('applies add and remove', () => {
    const obj = { a: 1, b: 2 };
    const atom: IJsonAtom = {
      format: 'json-atom',
      version: 1,
      operations: [
        { op: 'remove', path: '$.b', oldValue: 2 },
        { op: 'add', path: '$.c', value: 3 },
      ],
    };
    const result = applyAtom(obj, atom);
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('applies keyed array operations', () => {
    const obj = {
      items: [
        { id: '1', name: 'Widget', price: 10 },
        { id: '2', name: 'Gadget', price: 20 },
      ],
    };
    const atom: IJsonAtom = {
      format: 'json-atom',
      version: 1,
      operations: [
        { op: 'replace', path: "$.items[?(@.id=='1')].name", value: 'Widget Pro', oldValue: 'Widget' },
      ],
    };
    const result = applyAtom(obj, atom);
    expect(result.items[0].name).toBe('Widget Pro');
  });

  it('applies root add (from null)', () => {
    const result = applyAtom(null, {
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'add', path: '$', value: { hello: 'world' } }],
    });
    expect(result).toEqual({ hello: 'world' });
  });

  it('applies root remove (to null)', () => {
    const result = applyAtom({ hello: 'world' }, {
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'remove', path: '$', oldValue: { hello: 'world' } }],
    });
    expect(result).toBe(null);
  });

  it('applies root replace', () => {
    const result = applyAtom(
      { old: true },
      {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'replace', path: '$', value: { new: true }, oldValue: { old: true } }],
      }
    );
    expect(result).toEqual({ new: true });
  });

  it('root replace with primitive returns new value', () => {
    const result = applyAtom(
      'old',
      {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'replace', path: '$', value: 'new', oldValue: 'old' }],
      }
    );
    expect(result).toBe('new');
  });

  it('throws on invalid atom', () => {
    expect(() => applyAtom({}, { format: 'wrong' } as any)).toThrow();
  });

  it('root replace object with array returns array', () => {
    const result = applyAtom(
      { old: true },
      {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'replace', path: '$', value: [1, 2, 3], oldValue: { old: true } }],
      }
    );
    expect(result).toEqual([1, 2, 3]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('root replace array with object returns plain object', () => {
    const result = applyAtom(
      [1, 2, 3],
      {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'replace', path: '$', value: { new: true }, oldValue: [1, 2, 3] }],
      }
    );
    expect(result).toEqual({ new: true });
    expect(Array.isArray(result)).toBe(false);
  });

  it('root replace array with array returns new array', () => {
    const result = applyAtom(
      [1, 2],
      {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'replace', path: '$', value: [3, 4, 5], oldValue: [1, 2] }],
      }
    );
    expect(result).toEqual([3, 4, 5]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('applies operations sequentially (order matters)', () => {
    const obj = { items: ['a', 'b', 'c'] };
    // Remove index 1, then the array becomes ['a', 'c']
    // Then replace index 1 (which is now 'c') with 'd'
    const atom: IJsonAtom = {
      format: 'json-atom',
      version: 1,
      operations: [
        { op: 'remove', path: '$.items[1]', oldValue: 'b' },
        { op: 'replace', path: '$.items[1]', value: 'd', oldValue: 'c' },
      ],
    };
    const result = applyAtom(obj, atom);
    expect(result.items).toEqual(['a', 'd']);
  });
});

// ─── revertAtom ────────────────────────────────────────────────────────────

describe('revertAtom', () => {
  it('full round-trip: source → applyAtom → revertAtom == source', () => {
    const source = { name: 'Alice', age: 30, tags: ['admin'] };
    const target = { name: 'Bob', age: 31, tags: ['admin', 'user'] };
    const atom = diffAtom(source, target, { embeddedObjKeys: { tags: '$value' } });

    const applied = applyAtom(deepClone(source), atom);
    expect(applied).toEqual(target);

    const reverted = revertAtom(deepClone(applied), atom);
    expect(reverted).toEqual(source);
  });

  it('throws on non-reversible atom (missing oldValue)', () => {
    const atom: IJsonAtom = {
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'replace', path: '$.name', value: 'Bob' }],
    };
    expect(() => revertAtom({ name: 'Alice' }, atom)).toThrow(/not reversible/);
  });
});

// ─── invertAtom ────────────────────────────────────────────────────────────

describe('invertAtom', () => {
  it('inverts add → remove', () => {
    const atom: IJsonAtom = {
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'add', path: '$.x', value: 42 }],
    };
    const inverse = invertAtom(atom);
    expect(inverse.operations).toEqual([{ op: 'remove', path: '$.x', oldValue: 42 }]);
  });

  it('inverts remove → add', () => {
    const atom: IJsonAtom = {
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'remove', path: '$.x', oldValue: 42 }],
    };
    const inverse = invertAtom(atom);
    expect(inverse.operations).toEqual([{ op: 'add', path: '$.x', value: 42 }]);
  });

  it('inverts replace (swaps value and oldValue)', () => {
    const atom: IJsonAtom = {
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'replace', path: '$.name', value: 'Bob', oldValue: 'Alice' }],
    };
    const inverse = invertAtom(atom);
    expect(inverse.operations).toEqual([
      { op: 'replace', path: '$.name', value: 'Alice', oldValue: 'Bob' },
    ]);
  });

  it('reverses operation order', () => {
    const atom: IJsonAtom = {
      format: 'json-atom',
      version: 1,
      operations: [
        { op: 'add', path: '$.a', value: 1 },
        { op: 'add', path: '$.b', value: 2 },
      ],
    };
    const inverse = invertAtom(atom);
    expect(inverse.operations[0].path).toBe('$.b');
    expect(inverse.operations[1].path).toBe('$.a');
  });

  it('throws when replace missing oldValue', () => {
    const atom: IJsonAtom = {
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'replace', path: '$.x', value: 42 }],
    };
    expect(() => invertAtom(atom)).toThrow(/not reversible/);
  });

  it('throws when remove missing oldValue', () => {
    const atom: IJsonAtom = {
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'remove', path: '$.x' }],
    };
    expect(() => invertAtom(atom)).toThrow(/not reversible/);
  });

  it('preserves envelope extension properties', () => {
    const atom: IJsonAtom = {
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'add', path: '$.x', value: 1 }],
      x_source: 'test',
    };
    const inverse = invertAtom(atom);
    expect(inverse.x_source).toBe('test');
    expect(inverse.format).toBe('json-atom');
  });

  it('preserves operation-level extension properties', () => {
    const atom: IJsonAtom = {
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'add', path: '$.x', value: 1, x_author: 'alice' }],
    };
    const inverse = invertAtom(atom);
    expect(inverse.operations[0].x_author).toBe('alice');
  });

  it('throws on invalid atom input', () => {
    expect(() => invertAtom({ format: 'wrong' } as any)).toThrow(/Invalid atom/);
  });
});

// ─── Extension property preservation ────────────────────────────────────────

describe('extension property preservation', () => {
  it('applyAtom ignores extension properties without error', () => {
    const atom: IJsonAtom = {
      format: 'json-atom',
      version: 1,
      operations: [{ op: 'replace', path: '$.name', value: 'Bob', oldValue: 'Alice', x_reason: 'rename' }],
      x_metadata: { ts: 123 },
    };
    const result = applyAtom({ name: 'Alice' }, atom);
    expect(result).toEqual({ name: 'Bob' });
  });
});

// ─── Conformance Fixtures ───────────────────────────────────────────────────

describe('conformance fixtures', () => {
  describe('basic-replace', () => {
    const fixture = loadFixture('basic-replace');

    it('Level 1: applyAtom(source, atom) == target', () => {
      const result = applyAtom(deepClone(fixture.source), fixture.atom);
      expect(result).toEqual(fixture.target);
    });

    it('Level 2: applyAtom(target, inverse(atom)) == source', () => {
      const inverse = invertAtom(fixture.atom);
      const result = applyAtom(deepClone(fixture.target), inverse);
      expect(result).toEqual(fixture.source);
    });

    it('diffAtom produces equivalent atom (verified by apply)', () => {
      const computed = diffAtom(fixture.source, fixture.target);
      const result = applyAtom(deepClone(fixture.source), computed);
      expect(result).toEqual(fixture.target);
    });
  });

  describe('keyed-array-update', () => {
    const fixture = loadFixture('keyed-array-update');

    it('Level 1: applyAtom(source, atom) == target', () => {
      const result = applyAtom(deepClone(fixture.source), fixture.atom);
      expect(result).toEqual(fixture.target);
    });

    it('Level 2: applyAtom(target, inverse(atom)) == source', () => {
      const inverse = invertAtom(fixture.atom);
      const result = applyAtom(deepClone(fixture.target), inverse);
      expect(result).toEqual(fixture.source);
    });

    it('diffAtom produces equivalent atom (verified by apply)', () => {
      const opts = {
        embeddedObjKeys: fixture.computeHints?.arrayKeys || {},
      };
      const computed = diffAtom(fixture.source, fixture.target, opts);
      const result = applyAtom(deepClone(fixture.source), computed);
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
    const atom = diffAtom(source, target);
    expect(applyAtom(deepClone(source), atom)).toEqual(target);
    expect(revertAtom(deepClone(target), atom)).toEqual(source);
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
    const atom = diffAtom(source, target, { embeddedObjKeys: { items: 'id' } });
    expect(atom.operations).toHaveLength(1);
    expect(atom.operations[0].path).toBe('$.items[?(@.id==1)].details.color');
    expect(applyAtom(deepClone(source), atom)).toEqual(target);
    expect(revertAtom(deepClone(target), atom)).toEqual(source);
  });

  it('toAtom bridge: diff → toAtom → applyAtom', () => {
    const source = { a: 1, b: 'hello' };
    const target = { a: 2, b: 'world', c: true };
    const changeset = diff(source, target);
    const atom = toAtom(changeset);
    expect(applyAtom(deepClone(source), atom)).toEqual(target);
  });

  it('fromAtom bridge: diffAtom → fromAtom → unatomize → apply', () => {
    const source = { x: 10, y: 20 };
    const target = { x: 10, y: 30, z: 40 };
    const atom = diffAtom(source, target);
    const atoms = fromAtom(atom);
    const changeset = unatomizeChangeset(atoms);
    const result = deepClone(source);
    applyChangeset(result, changeset);
    expect(result).toEqual(target);
  });
});

// ─── move/copy operations ──────────────────────────────────────────────────

describe('move/copy operations', () => {
  // ─── Validation ─────────────────────────────────────────────────────────

  describe('validation', () => {
    it('accepts valid move operation', () => {
      const result = validateAtom({
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.b', from: '$.a' }],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts valid copy operation', () => {
      const result = validateAtom({
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'copy', path: '$.b', from: '$.a' }],
      });
      expect(result.valid).toBe(true);
    });

    it('accepts copy with value (for reversibility)', () => {
      const result = validateAtom({
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'copy', path: '$.b', from: '$.a', value: 42 }],
      });
      expect(result.valid).toBe(true);
    });

    it('rejects move without from', () => {
      const result = validateAtom({
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.b' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/from/);
    });

    it('rejects copy without from', () => {
      const result = validateAtom({
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'copy', path: '$.b' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/from/);
    });

    it('rejects move with value', () => {
      const result = validateAtom({
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.b', from: '$.a', value: 1 }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/must not have value/);
    });

    it('rejects move with oldValue', () => {
      const result = validateAtom({
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.b', from: '$.a', oldValue: 1 }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/must not have oldValue/);
    });

    it('rejects copy with oldValue', () => {
      const result = validateAtom({
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'copy', path: '$.b', from: '$.a', oldValue: 1 }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/must not have oldValue/);
    });

    it('rejects self-move (from === path)', () => {
      const result = validateAtom({
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.a', from: '$.a' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/self-move/);
    });

    it('rejects move into own subtree (dot)', () => {
      const result = validateAtom({
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.a.b.c', from: '$.a.b' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/subtree/);
    });

    it('rejects move into own subtree (bracket)', () => {
      const result = validateAtom({
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.a[0]', from: '$.a' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/subtree/);
    });

    it('accepts move from subtree to ancestor', () => {
      const result = validateAtom({
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.a', from: '$.a.b.c' }],
      });
      expect(result.valid).toBe(true);
    });

    it('rejects move with non-string from', () => {
      const result = validateAtom({
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.b', from: 123 }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/from/);
    });
  });

  // ─── Apply move ─────────────────────────────────────────────────────────

  describe('applyAtom move', () => {
    it('moves a property', () => {
      const obj = { a: 1, b: 2 };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.c', from: '$.a' }],
      };
      const result = applyAtom(obj, atom);
      expect(result).toEqual({ b: 2, c: 1 });
      expect(result).not.toHaveProperty('a');
    });

    it('moves a nested property', () => {
      const obj = { user: { name: 'Alice', age: 30 }, backup: {} };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.backup.name', from: '$.user.name' }],
      };
      const result = applyAtom(obj, atom);
      expect(result.user).not.toHaveProperty('name');
      expect(result.backup.name).toBe('Alice');
    });

    it('moves an array element by index', () => {
      const obj = { src: [10, 20, 30], dst: [100] };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.dst[1]', from: '$.src[1]' }],
      };
      const result = applyAtom(obj, atom);
      expect(result.src).toEqual([10, 30]);
      expect(result.dst).toEqual([100, 20]);
    });

    it('moves a keyed array element', () => {
      const obj = {
        items: [{ id: '1', name: 'Widget' }, { id: '2', name: 'Gadget' }],
        archive: [] as any[],
      };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.archive[0]', from: "$.items[?(@.id=='2')]" }],
      };
      const result = applyAtom(obj, atom);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('1');
      expect(result.archive).toHaveLength(1);
      expect(result.archive[0]).toEqual({ id: '2', name: 'Gadget' });
    });

    it('moves property to root', () => {
      const obj2 = { wrapper: { data: 42 } };
      const atom2: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.extracted', from: '$.wrapper.data' }],
      };
      const result = applyAtom(obj2, atom2);
      expect(result.wrapper).toEqual({});
      expect(result.extracted).toBe(42);
    });

    it('moves a complex object (preserves structure)', () => {
      const obj = { source: { nested: { deep: [1, 2, 3] } }, target: {} };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.target.data', from: '$.source.nested' }],
      };
      const result = applyAtom(obj, atom);
      expect(result.source).toEqual({});
      expect(result.target.data).toEqual({ deep: [1, 2, 3] });
    });

    it('move to root replaces entire document', () => {
      const obj = { a: 1, b: { x: 10 } };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$', from: '$.b' }],
      };
      const result = applyAtom(obj, atom);
      expect(result).toEqual({ x: 10 });
    });

    it('move from root to descendant results in null (root removed)', () => {
      const obj = { a: 1 };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.backup', from: '$' }],
      };
      // Validation passes. After removing root it becomes null — adding $.backup
      // on null has no effect, so result is null.
      expect(validateAtom(atom).valid).toBe(true);
      const result = applyAtom(obj, atom);
      expect(result).toBeNull();
    });

    it('keyed array consistency after move', () => {
      const obj = {
        active: [{ id: 'a', val: 1 }, { id: 'b', val: 2 }],
        inactive: [{ id: 'c', val: 3 }],
      };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.inactive[1]', from: "$.active[?(@.id=='b')]" }],
      };
      const result = applyAtom(obj, atom);
      expect(result.active).toHaveLength(1);
      expect(result.active[0].id).toBe('a');
      expect(result.inactive).toHaveLength(2);
      expect(result.inactive[1]).toEqual({ id: 'b', val: 2 });
    });
  });

  // ─── Apply copy ─────────────────────────────────────────────────────────

  describe('applyAtom copy', () => {
    it('copies a property', () => {
      const obj = { a: 1, b: 2 };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'copy', path: '$.c', from: '$.a' }],
      };
      const result = applyAtom(obj, atom);
      expect(result).toEqual({ a: 1, b: 2, c: 1 });
    });

    it('copy preserves source', () => {
      const obj = { src: { nested: 42 } };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'copy', path: '$.dst', from: '$.src' }],
      };
      const result = applyAtom(obj, atom);
      expect(result.src).toEqual({ nested: 42 });
      expect(result.dst).toEqual({ nested: 42 });
    });

    it('copy deep-clones (no shared references)', () => {
      const obj = { src: { nested: { deep: [1, 2] } } };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'copy', path: '$.dst', from: '$.src' }],
      };
      const result = applyAtom(obj, atom);
      // Mutate copy should not affect source
      result.dst.nested.deep.push(3);
      expect(result.src.nested.deep).toEqual([1, 2]);
    });

    it('copies from root', () => {
      const obj = { a: 1 };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'copy', path: '$.snapshot', from: '$' }],
      };
      const result = applyAtom(obj, atom);
      expect(result.a).toBe(1);
      expect(result.snapshot).toEqual({ a: 1 });
    });

    it('copies an array element', () => {
      const obj = { items: ['a', 'b', 'c'] };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'copy', path: '$.items[3]', from: '$.items[0]' }],
      };
      const result = applyAtom(obj, atom);
      expect(result.items).toEqual(['a', 'b', 'c', 'a']);
    });

    it('copies a keyed array element', () => {
      const obj = {
        items: [{ id: '1', name: 'Widget' }],
        copies: [] as any[],
      };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'copy', path: '$.copies[0]', from: "$.items[?(@.id=='1')]" }],
      };
      const result = applyAtom(obj, atom);
      expect(result.items).toHaveLength(1);
      expect(result.copies).toHaveLength(1);
      expect(result.copies[0]).toEqual({ id: '1', name: 'Widget' });
    });

    it('copy to root replaces entire document', () => {
      const obj = { a: 1, b: { x: 10 } };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'copy', path: '$', from: '$.b' }],
      };
      const result = applyAtom(obj, atom);
      expect(result).toEqual({ x: 10 });
    });
  });

  // ─── Inversion ──────────────────────────────────────────────────────────

  describe('invertAtom move/copy', () => {
    it('inverts move by swapping from and path', () => {
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.b', from: '$.a' }],
      };
      const inverse = invertAtom(atom);
      expect(inverse.operations).toEqual([
        { op: 'move', from: '$.b', path: '$.a' },
      ]);
    });

    it('move round-trip: apply then revert', () => {
      const obj = { a: 1, b: 2 };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.c', from: '$.a' }],
      };
      const applied = applyAtom(deepClone(obj), atom);
      expect(applied).toEqual({ b: 2, c: 1 });
      const inverse = invertAtom(atom);
      const reverted = applyAtom(deepClone(applied), inverse);
      expect(reverted).toEqual(obj);
    });

    it('inverts copy to remove', () => {
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'copy', path: '$.b', from: '$.a', value: 42 }],
      };
      const inverse = invertAtom(atom);
      expect(inverse.operations).toEqual([
        { op: 'remove', path: '$.b', oldValue: 42 },
      ]);
    });

    it('copy round-trip: apply then revert', () => {
      const obj = { a: 1 };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'copy', path: '$.b', from: '$.a', value: 1 }],
      };
      const applied = applyAtom(deepClone(obj), atom);
      expect(applied).toEqual({ a: 1, b: 1 });
      const inverse = invertAtom(atom);
      const reverted = applyAtom(deepClone(applied), inverse);
      expect(reverted).toEqual(obj);
    });

    it('throws when copy missing value for inversion', () => {
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'copy', path: '$.b', from: '$.a' }],
      };
      expect(() => invertAtom(atom)).toThrow(/copy operation missing value/);
    });

    it('preserves extension properties on move/copy inversion', () => {
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.b', from: '$.a', x_reason: 'rename' }],
      };
      const inverse = invertAtom(atom);
      expect(inverse.operations[0].x_reason).toBe('rename');
    });

    it('multi-op inversion preserves order reversal', () => {
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [
          { op: 'move', path: '$.b', from: '$.a' },
          { op: 'copy', path: '$.d', from: '$.c', value: 3 },
        ],
      };
      const inverse = invertAtom(atom);
      expect(inverse.operations).toHaveLength(2);
      // Reversed order
      expect(inverse.operations[0]).toEqual({ op: 'remove', path: '$.d', oldValue: 3 });
      expect(inverse.operations[1]).toEqual({ op: 'move', from: '$.b', path: '$.a' });
    });
  });

  // ─── fromAtom rejection ─────────────────────────────────────────────────

  describe('fromAtom move/copy rejection', () => {
    it('throws on move operation', () => {
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.b', from: '$.a' }],
      };
      expect(() => fromAtom(atom)).toThrow(/move operations cannot be converted/);
    });

    it('throws on copy operation', () => {
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'copy', path: '$.b', from: '$.a' }],
      };
      expect(() => fromAtom(atom)).toThrow(/copy operations cannot be converted/);
    });
  });

  // ─── Sequential semantics ──────────────────────────────────────────────

  describe('sequential semantics', () => {
    it('move then operate on moved value', () => {
      const obj = { a: { x: 1 } };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [
          { op: 'move', path: '$.b', from: '$.a' },
          { op: 'replace', path: '$.b.x', value: 2, oldValue: 1 },
        ],
      };
      const result = applyAtom(obj, atom);
      expect(result).toEqual({ b: { x: 2 } });
    });

    it('copy then modify independently', () => {
      const obj = { a: { x: 1 } };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [
          { op: 'copy', path: '$.b', from: '$.a' },
          { op: 'replace', path: '$.b.x', value: 99, oldValue: 1 },
        ],
      };
      const result = applyAtom(obj, atom);
      expect(result.a).toEqual({ x: 1 });
      expect(result.b).toEqual({ x: 99 });
    });

    it('multiple moves in sequence', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [
          { op: 'move', path: '$.x', from: '$.a' },
          { op: 'move', path: '$.y', from: '$.b' },
          { op: 'move', path: '$.z', from: '$.c' },
        ],
      };
      const result = applyAtom(obj, atom);
      expect(result).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('mixed move/copy/add/remove/replace', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [
          { op: 'copy', path: '$.a_copy', from: '$.a' },
          { op: 'move', path: '$.renamed_b', from: '$.b' },
          { op: 'remove', path: '$.c', oldValue: 3 },
          { op: 'add', path: '$.d', value: 4 },
          { op: 'replace', path: '$.a', value: 10, oldValue: 1 },
        ],
      };
      const result = applyAtom(obj, atom);
      expect(result).toEqual({ a: 10, a_copy: 1, renamed_b: 2, d: 4 });
    });
  });

  // ─── Edge cases ─────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('move null value', () => {
      const obj: Record<string, any> = { a: null, b: 1 };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.c', from: '$.a' }],
      };
      const result = applyAtom(obj, atom);
      expect(result).toEqual({ b: 1, c: null });
    });

    it('copy null value', () => {
      const obj: Record<string, any> = { a: null };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'copy', path: '$.b', from: '$.a' }],
      };
      const result = applyAtom(obj, atom);
      expect(result).toEqual({ a: null, b: null });
    });

    it('move with bracket-quoted filter paths', () => {
      const obj = {
        items: [{ id: '1', name: 'Widget' }],
        backup: {} as Record<string, any>,
      };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.backup.item', from: "$.items[?(@.id=='1')].name" }],
      };
      const result = applyAtom(obj, atom);
      expect(result.items[0]).not.toHaveProperty('name');
      expect(result.backup.item).toBe('Widget');
    });

    it('move empty object', () => {
      const obj = { a: {}, b: 1 };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.c', from: '$.a' }],
      };
      const result = applyAtom(obj, atom);
      expect(result).toEqual({ b: 1, c: {} });
    });

    it('copy from value-filtered array element', () => {
      const obj = { tags: ['urgent', 'review'], backup: [] as string[] };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'copy', path: '$.backup[0]', from: "$.tags[?(@=='urgent')]" }],
      };
      const result = applyAtom(obj, atom);
      expect(result.backup).toEqual(['urgent']);
    });

    it('move errors on property access on non-object', () => {
      const obj = { a: 42 };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.b', from: '$.a.nested' }],
      };
      expect(() => applyAtom(obj, atom)).toThrow(/Cannot access property/);
    });

    it('copy errors on index access on non-array', () => {
      const obj = { a: 'str' };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'copy', path: '$.b', from: '$.a[0]' }],
      };
      expect(() => applyAtom(obj, atom)).toThrow(/Cannot access index/);
    });

    it('move errors on filter on non-array', () => {
      const obj = { a: { id: 1 } };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.b', from: "$.a[?(@.id==1)]" }],
      };
      expect(() => applyAtom(obj, atom)).toThrow(/Cannot apply key filter/);
    });

    it('copy errors on value filter on non-array', () => {
      const obj = { a: 'str' };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'copy', path: '$.b', from: "$.a[?(@=='x')]" }],
      };
      expect(() => applyAtom(obj, atom)).toThrow(/Cannot apply value filter/);
    });

    it('move empty array', () => {
      const obj = { a: [] as any[], b: 1 };
      const atom: IJsonAtom = {
        format: 'json-atom',
        version: 1,
        operations: [{ op: 'move', path: '$.c', from: '$.a' }],
      };
      const result = applyAtom(obj, atom);
      expect(result).toEqual({ b: 1, c: [] });
    });
  });
});
