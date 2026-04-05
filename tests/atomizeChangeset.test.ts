import { diff, atomizeChangeset, applyChangeset, unatomizeChangeset, Operation } from '../src/jsonDiff';
import type { FunctionKey } from '../src/helpers';

describe('atomizeChangeset', () => {
  test('when JSON path segements contain periods', (done) => {
    const oldObject = { 'a.b': 1 };
    const newObject = { 'a.b': 2 };

    const actual = atomizeChangeset(diff(oldObject, newObject))[0];

    expect(actual.path).toBe('$[a.b]');
    done();
  });

  test('when JSON path segments containing periods use embedded keys', (done) => {
    const oldObject = { 'a.b': [{ c: 1 }] };
    const newObject = { 'a.b': [{ c: 2 }] };
    const diffs = diff(oldObject, newObject, { embeddedObjKeys: { 'a.b': 'c' } });

    const actual = atomizeChangeset(diffs);

    expect(actual.length).toBe(2);
    // With embedded keys, paths use filter expressions
    expect(actual[0].path).toBe("$[a.b][?(@.c=='2')]");
    expect(actual[1].path).toBe("$[a.b][?(@.c=='1')]");
    done();
  });

  test('when embedded key name contains periods', (done) => {
    const oldObject = { a: [{ b: 1, 'c.d': 10 }] };
    const newObject = { a: [{ b: 2, 'c.d': 20 }] };
    const diffs = diff(oldObject, newObject, { embeddedObjKeys: { a: 'c.d' } });

    const actual = atomizeChangeset(diffs);

    expect(actual.length).toBe(2);
    // With embedded keys containing periods, use filter expressions
    expect(actual[0].path).toBe("$.a[?(@['c.d']=='20')]");
    expect(actual[1].path).toBe("$.a[?(@['c.d']=='10')]");
    done();
  });

  test('when function-based identity key returns nested path, filter uses dot notation (#392)', () => {
    const oldObj = {
      items: [
        { positionNumber: { value: "001" }, description: "alpha" },
        { positionNumber: { value: "002" }, description: "beta" },
      ],
    };
    const newObj = {
      items: [{ positionNumber: { value: "001" }, description: "alpha" }],
    };

    const resolver: FunctionKey = (obj, shouldReturnKeyName) => {
      if (shouldReturnKeyName) return "positionNumber.value";
      return obj.positionNumber.value;
    };

    const changes = diff(oldObj, newObj, {
      embeddedObjKeys: { items: resolver },
    });
    const atomic = atomizeChangeset(changes);
    const removes = atomic.filter((c) => c.type === Operation.REMOVE);
    expect(removes).toHaveLength(1);
    // Nested path from function key → dot notation per RFC 9535
    expect(removes[0].path).toBe("$.items[?(@.positionNumber.value=='002')]");

    // Apply changeset should produce the expected result
    const applied = applyChangeset(JSON.parse(JSON.stringify(oldObj)), changes);
    expect(JSON.stringify(applied)).toEqual(JSON.stringify(newObj));

    // Atomize → unatomize → apply round-trip
    const unatomized = unatomizeChangeset(atomic);
    const appliedRoundTrip = applyChangeset(JSON.parse(JSON.stringify(oldObj)), unatomized);
    expect(JSON.stringify(appliedRoundTrip)).toEqual(JSON.stringify(newObj));
  });

  test('when function-based key returns non-identifier dotted name, uses bracket notation', () => {
    const oldObj = { items: [{ 'a-b': { c: 'x' }, v: 1 }] };
    const newObj = { items: [{ 'a-b': { c: 'x' }, v: 2 }] };

    const resolver: FunctionKey = (obj, shouldReturnKeyName) => {
      if (shouldReturnKeyName) return "a-b.c"; // not a valid nested identifier path
      return obj['a-b']?.c;
    };

    const changes = diff(oldObj, newObj, {
      embeddedObjKeys: { items: resolver },
    });
    const atomic = atomizeChangeset(changes);
    // a-b.c fails NESTED_PATH_RE → bracket notation, NOT dot notation
    expect(atomic[0].path).toBe("$.items[?(@['a-b.c']=='x')].v");
  });

  test('when simple identity key, embeddedKeyIsPath is not set and round-trips', () => {
    const oldObj = { items: [{ id: 1, v: 'a' }] };
    const newObj = { items: [{ id: 1, v: 'b' }] };
    const changes = diff(oldObj, newObj, { embeddedObjKeys: { items: 'id' } });

    // Single-segment key should NOT have embeddedKeyIsPath
    expect(changes[0].embeddedKeyIsPath).toBeUndefined();

    const atomic = atomizeChangeset(changes);
    expect(atomic[0].path).toBe("$.items[?(@.id=='1')].v");

    // Round-trip through unatomize + apply
    const unatomized = unatomizeChangeset(atomic);
    expect(unatomized[0].embeddedKeyIsPath).toBeUndefined();
    const applied = applyChangeset(JSON.parse(JSON.stringify(oldObj)), unatomized);
    expect(JSON.stringify(applied)).toEqual(JSON.stringify(newObj));
  });

  test('when literal dot-key identity uses bracket notation and applies correctly', () => {
    const oldObject = { a: [{ b: 1, 'c.d': 10 }] };
    const newObject = { a: [{ b: 2, 'c.d': 10 }] };
    const diffs = diff(oldObject, newObject, { embeddedObjKeys: { a: 'c.d' } });

    // Apply produces correct result
    const applied = applyChangeset(JSON.parse(JSON.stringify(oldObject)), diffs);
    expect(JSON.stringify(applied)).toEqual(JSON.stringify(newObject));

    // Atomize → unatomize → apply round-trip
    const atomized = atomizeChangeset(diffs);
    // Literal dot-key uses bracket notation
    expect(atomized[0].path).toBe("$.a[?(@['c.d']=='10')].b");
    const unatomized = unatomizeChangeset(atomized);
    const fromRoundTrip = applyChangeset(JSON.parse(JSON.stringify(oldObject)), unatomized);
    expect(JSON.stringify(fromRoundTrip)).toEqual(JSON.stringify(newObject));
  });

  test('when identity key value contains a single quote, round-trips correctly', () => {
    const oldObj = { items: [{ name: "O'Brien", v: 1 }] };
    const newObj = { items: [{ name: "O'Brien", v: 2 }] };
    const changes = diff(oldObj, newObj, { embeddedObjKeys: { items: 'name' } });
    const atomic = atomizeChangeset(changes);
    expect(atomic[0].path).toBe("$.items[?(@.name=='O''Brien')].v");

    // Atomize → unatomize → apply round-trip with escaped quotes
    const unatomized = unatomizeChangeset(atomic);
    const applied = applyChangeset(JSON.parse(JSON.stringify(oldObj)), unatomized);
    expect(JSON.stringify(applied)).toEqual(JSON.stringify(newObj));
  });

  test('when identity key name contains a single quote, round-trips correctly', () => {
    const oldObj = { items: [{ "it's": 'x', v: 1 }] };
    const newObj = { items: [{ "it's": 'x', v: 2 }] };
    const changes = diff(oldObj, newObj, { embeddedObjKeys: { items: "it's" } });
    const atomic = atomizeChangeset(changes);
    expect(atomic[0].path).toBe("$.items[?(@['it''s']=='x')].v");

    // Atomize → unatomize → apply round-trip with escaped quotes in key
    const unatomized = unatomizeChangeset(atomic);
    const applied = applyChangeset(JSON.parse(JSON.stringify(oldObj)), unatomized);
    expect(JSON.stringify(applied)).toEqual(JSON.stringify(newObj));
  });

  test('when atomizing and unatomizing object properties', (done) => {
    const oldData: {
      planet: string;
      characters: Array<{
        id: string;
        name: null | { firstName: string; lastName: string };
      }>;
    } = {
      planet: "Tatooine",
      characters: [{ id: "LUK", name: null }],
    };

    const newData: typeof oldData = {
      planet: "Tatooine",
      characters: [{ id: "LUK", name: { firstName: "Luke", lastName: "Skywalker" } }],
    };

    const options = {
      embeddedObjKeys: { ".characters": "id" },
    };

    // Get the diffs between oldData and newData
    const originalDiffs = diff(oldData, newData, options);

    // Atomize and then unatomize the diffs
    const atomizedDiffs = atomizeChangeset(originalDiffs);
    const unatomizedDiffs = unatomizeChangeset(atomizedDiffs);

    // Applying the original diffs should produce the expected result
    const dataWithOriginalDiffs = applyChangeset(JSON.parse(JSON.stringify(oldData)), originalDiffs);

    // Applying the unatomized diffs should produce the same result
    const dataWithUnatomizedDiffs = applyChangeset(JSON.parse(JSON.stringify(oldData)), unatomizedDiffs);

    // The unatomized diffs should yield the same result as the original diffs
    expect(JSON.stringify(dataWithOriginalDiffs)).toEqual(JSON.stringify(dataWithUnatomizedDiffs));
    done();
  });
});
