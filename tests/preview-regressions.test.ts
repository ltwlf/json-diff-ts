import { diff, atomizeChangeset, unatomizeChangeset, applyChangeset, revertChangeset } from '../src/jsonDiff';
import { diffAtom, applyAtom, revertAtom, toAtom, fromAtom } from '../src/jsonAtom';

describe('special property paths (#415)', () => {
  const keys = ['a.b', 'a[0]', 'a]b', "O'Brien", '', '0', '1.2', 'a\\b', 'a b', 'a)]b'];
  it.each(keys)('round-trips nested property %j through both formats', (key) => {
    const before = { [key]: { [key]: 1 }, x: { [key]: 1 } };
    const after = { [key]: { [key]: 2 }, x: { [key]: 2 } };
    const changes = diff(before, after);
    const atomic = atomizeChangeset(changes);
    expect(applyChangeset(structuredClone(before), unatomizeChangeset(atomic))).toEqual(after);
    const atom = diffAtom(before, after);
    expect(applyAtom(structuredClone(before), atom)).toEqual(after);
    expect(revertAtom(structuredClone(after), atom)).toEqual(before);
    expect(applyAtom(structuredClone(before), toAtom(atomic))).toEqual(after);
    expect(applyChangeset(structuredClone(before), unatomizeChangeset(fromAtom(atom)))).toEqual(after);
  });

  it.each(keys)('round-trips arrays below property %j', (key) => {
    const before = { [key]: [{ id: 'one', [key]: 1 }] };
    const after = { [key]: [{ id: 'one', [key]: 2 }] };
    for (const options of [{}, { arrayIdentityKeys: { [key]: 'id' } }]) {
      const changes = diff(before, after, options);
      expect(applyChangeset(structuredClone(before), unatomizeChangeset(atomizeChangeset(changes)))).toEqual(after);
      expect(applyAtom(structuredClone(before), diffAtom(before, after, options))).toEqual(after);
    }
  });

  it('round-trips root and consecutive array selectors', () => {
    const before = [[{ 'a.b': 1 }]];
    const after = [[{ 'a.b': 2 }]];
    expect(applyChangeset(structuredClone(before), unatomizeChangeset(atomizeChangeset(diff(before, after))))).toEqual(after);
    expect(applyAtom(structuredClone(before), diffAtom(before, after))).toEqual(after);
  });
});

describe('reverting changesets', () => {
  it('does not mutate the changeset or change subsequent apply order', () => {
    const before = { a: 1, b: [1] };
    const after = { a: 'one', b: [1, 2, 3] };
    const changes = diff(before, after);
    const saved = structuredClone(changes);
    expect(revertChangeset(structuredClone(after), changes)).toEqual(before);
    expect(changes).toEqual(saved);
    expect(applyChangeset(structuredClone(before), changes)).toEqual(after);
  });
});

describe('keysToInclude (#403)', () => {
  const before = {
    positions: [{ id: 'p1', quantity: 1, noise: 1, deliveries: [{ id: 'd1', quantity: 2, noise: 2 }] }],
    unrelated: { value: 1 }
  };
  const after = {
    positions: [{ id: 'p1', quantity: 10, noise: 10, deliveries: [{ id: 'd1', quantity: 20, noise: 20 }] }],
    unrelated: { value: 10 }
  };

  it.each([false, true])('filters nested array fields with identity keys: %s', (identity) => {
    const atom = diffAtom(before, after, {
      keysToInclude: ['positions.quantity', 'positions.deliveries.quantity'],
      ...(identity ? { arrayIdentityKeys: { positions: 'id', 'positions.deliveries': 'id' } } : {})
    });
    expect(atom.operations).toHaveLength(2);
    expect(atom.operations.map(op => op.path)).toEqual(identity ? [
      "$.positions[?(@.id=='p1')].quantity", "$.positions[?(@.id=='p1')].deliveries[?(@.id=='d1')].quantity"
    ] : ['$.positions[0].quantity', '$.positions[0].deliveries[0].quantity']);
    const expected = structuredClone(before);
    expected.positions[0].quantity = 10;
    expected.positions[0].deliveries[0].quantity = 20;
    expect(applyAtom(structuredClone(before), atom)).toEqual(expected);
    expect(revertAtom(structuredClone(expected), atom)).toEqual(before);
  });

  it('includes whole subtrees and lets skip win', () => {
    const atom = diffAtom(before, after, {
      keysToInclude: ['positions'], keysToSkip: ['positions.noise', 'positions.deliveries']
    });
    expect(atom.operations.map(op => op.path)).toEqual(['$.positions[0].quantity']);
  });

  it('prunes excluded branches before reading their values', () => {
    const oldObj = { selected: 1, get excluded() { throw new Error('must not traverse'); } };
    const newObj = { selected: 2, get excluded() { throw new Error('must not traverse'); } };
    expect(diffAtom(oldObj, newObj, { keysToInclude: ['selected'] }).operations).toHaveLength(1);
  });

  it('empty includes select nothing, omitted includes retain existing behavior', () => {
    expect(diffAtom(before, after, { keysToInclude: [] }).operations).toEqual([]);
    expect(diffAtom(before, after).operations).toHaveLength(5);
    expect(diffAtom(1, 2, { keysToInclude: [] }).operations).toEqual([]);
  });

  it('does not confuse path prefixes with descendants', () => {
    const atom = diffAtom({ a: { b: 1 }, ab: 1 }, { a: { b: 2 }, ab: 2 }, { keysToInclude: ['a'] });
    expect(atom.operations.map(op => op.path)).toEqual(['$.a.b']);
  });

  it('filters added and removed fields', () => {
    const atom = diffAtom({ selected: { removed: 1 }, ignored: 1 }, { selected: { added: 2 }, other: 2 }, {
      keysToInclude: ['selected']
    });
    expect(atom.operations.map(op => op.path)).toEqual(['$.selected.added', '$.selected.removed']);
  });

  it('keeps structural additions/removals intact so selected descendants can be applied', () => {
    const oldObj = {};
    const newObj = { positions: before.positions, ignored: true };
    const atom = diffAtom(oldObj, newObj, { keysToInclude: ['positions.quantity'] });
    expect(atom.operations).toEqual([{ op: 'add', path: '$.positions', value: before.positions }]);
    expect(applyAtom({}, atom)).toEqual({ positions: before.positions });
    expect(revertAtom({ positions: structuredClone(before.positions) }, atom)).toEqual({});
  });

  it('skips an included path when an ancestor is excluded', () => {
    expect(diffAtom(before, after, { keysToInclude: ['positions.quantity'], keysToSkip: ['positions'] }).operations).toEqual([]);
  });
});

describe('literal identity properties', () => {
  it.each(['a.b', 'a[0]', "O'Brien", 'a==b'])('preserves the literal identity key %j', (key) => {
    const before = { items: [{ [key]: 42, value: 1 }] };
    const after = { items: [{ [key]: 42, value: 2 }] };
    const options = { arrayIdentityKeys: { items: key } };
    const atom = diffAtom(before, after, options);
    expect(applyAtom(structuredClone(before), atom)).toEqual(after);
    expect(revertAtom(structuredClone(after), atom)).toEqual(before);
    expect(applyChangeset(structuredClone(before), unatomizeChangeset(atomizeChangeset(diff(before, after, options))))).toEqual(after);
  });
});

describe('include selection with nested identity resolvers', () => {
  it('retains typed filters below a nested identity field', () => {
    const before = { positions: [{ id: { value: 'p1' }, deliveries: [{ id: 42, quantity: 1, ignored: 1 }] }] };
    const after = { positions: [{ id: { value: 'p1' }, deliveries: [{ id: 42, quantity: 2, ignored: 2 }] }] };
    const atom = diffAtom(before, after, {
      arrayIdentityKeys: {
        positions: (obj, keyName) => keyName ? 'id.value' : obj.id.value,
        'positions.deliveries': 'id'
      },
      keysToInclude: ['positions.deliveries.quantity']
    });
    expect(atom.operations).toEqual([{
      op: 'replace', path: "$.positions[?(@.id.value=='p1')].deliveries[?(@.id==42)].quantity", oldValue: 1, value: 2
    }]);
    const expected = structuredClone(before);
    expected.positions[0].deliveries[0].quantity = 2;
    expect(applyAtom(structuredClone(before), atom)).toEqual(expected);
  });
});
