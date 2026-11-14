import { diff } from '../src/jsonDiff';
import { applyAtom, diffAtom, revertAtom, validateAtom, toAtom, IJsonAtom } from '../src/jsonAtom';
import { atomSpecDict, operationExtensions } from '../src/atomHelpers';
import { parseAtomPath } from '../src/atomPath';

const envelope = (operations: IJsonAtom['operations']): IJsonAtom => ({ format: 'json-atom', version: 1, operations });
const values = [null, false, true, 0, 1, '', 'x', {}, {a: null}, {a: 1}, {a: []}, [], [1], [1, 2, 3], [null], [false], [[1, 2], [3]], [[1], [3, 4]], {a: [1, 2, 3]}, {a: [null]}];

describe('stable release review', () => {
  it.each(values.flatMap((before, i) => values.map((after, j) => ({ before, after, name: `${i} -> ${j}` }))))('round-trips JSON values $name', ({before, after}) => {
    const atom = diffAtom(before, after);
    expect(applyAtom(structuredClone(before), atom)).toEqual(after);
    expect(revertAtom(structuredClone(after), atom)).toEqual(before);
  });

  it('preserves move and copy sources in spec serialization', () => {
    for (const op of ['move', 'copy'] as const) {
      const atom = envelope([{op, from: '$.a', path: '$.b', x_note: 'extension'}]);
      expect(atomSpecDict(atom).operations[0]).toEqual({op, from: '$.a', path: '$.b'});
      expect(operationExtensions(atom.operations[0])).toEqual({x_note: 'extension'});
    }
  });

  it('matches typed identity filters without string coercion', () => {
    const source = {items: [{id: '1', value: 1}, {id: 1, value: 2}]};
    const atom = envelope([{op: 'replace', path: '$.items[?(@.id==1)].value', value: 3}]);
    expect(applyAtom(source, atom)).toEqual({items: [{id: '1', value: 1}, {id: 1, value: 3}]});
  });

  it.each([20, true, null])('removes primitive value %j using typed equality', value => {
    expect(applyAtom({items: [value]}, envelope([{op: 'remove', path: `$.items[?(@==${JSON.stringify(value)})]`}]))).toEqual({items: []});
  });

  it.each(['$[1x]', '$[1.5]', '$[1e2]', '$.0', '$[9007199254740992]'])('rejects malformed path %s', path => {
    expect(() => parseAtomPath(path)).toThrow();
    expect(validateAtom(envelope([{op: 'remove', path}])).valid).toBe(false);
  });

  it.each([0, 1.5, 2, NaN, Infinity])('rejects unsupported version %s', version => {
    expect(validateAtom({format: 'json-atom', version, operations: []}).valid).toBe(false);
  });

  it('rejects missing and ambiguous targets', () => {
    expect(() => applyAtom({}, envelope([{op: 'remove', path: '$.missing'}]))).toThrow();
    expect(() => applyAtom({a: 1}, envelope([{op: 'add', path: '$.a', value: 2}]))).toThrow();
    expect(() => applyAtom({items: [{id: 1}, {id: 1}]}, envelope([{op: 'remove', path: '$.items[?(@.id==1)]'}]))).toThrow();
    expect(() => applyAtom({items: [1]}, envelope([{op: 'remove', path: '$.items[2]'}]))).toThrow();
  });

  it('rejects inconsistent keyed-array additions', () => {
    expect(() => applyAtom({items: []}, envelope([{op: 'add', path: '$.items[?(@.id==1)]', value: {id: '1'}}]))).toThrow();
  });

  it('rejects moving root or an equivalent bracket path into its own subtree', () => {
    expect(validateAtom(envelope([{op: 'move', from: '$', path: '$.backup'}])).valid).toBe(false);
    expect(validateAtom(envelope([{op: 'move', from: '$.a', path: "$['a'].b"}])).valid).toBe(false);
  });

  it('rejects a failed move before removing its source', () => {
    const source = {a: 1, b: 2};
    expect(() => applyAtom(source, envelope([{op: 'move', from: '$.a', path: '$.b'}]))).toThrow();
    expect(source).toEqual({a: 1, b: 2});
  });

  it('does not mutate stored operation payloads when later operations change them', () => {
    const atom = envelope([{op: 'add', path: '$.a', value: {b: 1}}, {op: 'replace', path: '$.a.b', value: 2, oldValue: 1}]);
    const saved = structuredClone(atom);
    expect(applyAtom({}, atom)).toEqual({a: {b: 2}});
    expect(atom).toEqual(saved);
  });

  it('does not traverse inherited object members', () => {
    const prototype = {nested: {value: 1}};
    const source = Object.create(prototype);
    expect(() => applyAtom(source, envelope([{op: 'replace', path: '$.nested.value', value: 2}]))).toThrow();
    expect(prototype.nested.value).toBe(1);
  });

  it('stores special JSON object keys as own data properties', () => {
    const source = {};
    const result = applyAtom(source, envelope([{op: 'add', path: "$['__proto__']", value: {safe: true}}]));
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(result['__proto__']).toEqual({safe: true});
  });
});

describe('stable JSON Atom constraints', () => {
  it('accepts bracket-for-everything and mixed nested filter members', () => {
    const source = {items: [{metadata: {'a.b': 42}, value: 1}]};
    const atom = envelope([{op: 'replace', path: "$['items'][?(@['metadata']['a.b']==42)]['value']", value: 2}]);
    expect(applyAtom(source, atom)).toEqual({items: [{metadata: {'a.b': 42}, value: 2}]});
  });
  it.each([undefined, NaN, Infinity, new Date(), /x/, () => 1])('rejects non-JSON operation values %s', value => {
    expect(validateAtom(envelope([{op: 'add', path: '$.a', value}])).valid).toBe(false);
  });
  it('rejects cyclic operation payloads', () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(validateAtom(envelope([{op: 'add', path: '$.a', value}])).valid).toBe(false);
  });
  it('treats an actual $root property as a property', () => {
    const before = {$root: 1};
    const after: { $root: number | null } = {$root: null};
    const atom = diffAtom(before, after);
    expect(atom.operations[0].path).toBe("$['$root']");
    expect(applyAtom(structuredClone(before), atom)).toEqual(after);
    expect(revertAtom(structuredClone(after), atom)).toEqual(before);
  });
});

describe('identity and inversion edge cases', () => {
  it('rejects duplicate producer identities instead of collapsing array elements', () => {
    expect(() => diffAtom({items: [{id: 1}, {id: 1}]}, {items: [{id: 1}]}, {arrayIdentityKeys: {items: 'id'}})).toThrow(/Duplicate/);
    expect(() => diffAtom({items: [1, 1]}, {items: [1]}, {arrayIdentityKeys: {items: '$value'}})).toThrow(/Duplicate/);
    expect(() => diffAtom({items: [{id: 1}, {id: '1'}]}, {items: [{id: 1}]}, {arrayIdentityKeys: {items: 'id'}})).toThrow(/Duplicate/);
  });
  it('round-trips reserved object names as array identities', () => {
    const before = {items: [{id: '__proto__', value: 1}]};
    const after = {items: [{id: '__proto__', value: 2}]};
    const atom = diffAtom(before, after, {arrayIdentityKeys: {items: 'id'}});
    expect(applyAtom(structuredClone(before), atom)).toEqual(after);
  });
  it('inverts root replacement with null', () => {
    const atom = envelope([{op: 'replace', path: '$', oldValue: 1, value: null}]);
    expect(revertAtom(applyAtom(1, atom), atom)).toBe(1);
  });
  it('inverts a replacement selected by its previous primitive value', () => {
    const atom = envelope([{op: 'replace', path: '$[?(@==1)]', oldValue: 1, value: 2}]);
    expect(revertAtom(applyAtom([1], atom), atom)).toEqual([1]);
  });
});


describe('legacy bridge ordering', () => {
  it('applies and reverts multiple index removals converted from a v4 changeset', () => {
    const before = {items: [1, 2, 3]};
    const after = {items: [9]};
    const atom = toAtom(diff(before, after));
    expect(applyAtom(structuredClone(before), atom)).toEqual(after);
    expect(revertAtom(structuredClone(after), atom)).toEqual(before);
  });
});
