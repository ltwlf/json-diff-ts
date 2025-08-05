import { diff, atomizeChangeset, applyChangeset, unatomizeChangeset, Operation } from '../src/jsonDiff';

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
    expect(actual[0].path).toBe("$.a[?(@[c.d]=='20')]");
    expect(actual[1].path).toBe("$.a[?(@[c.d]=='10')]");
    done();
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

  test('atomize and unatomize MOVE operations', () => {
    const before = { items: [{ id: 1 }, { id: 2 }, { id: 3 }] };
    const after = { items: [{ id: 2 }, { id: 1 }, { id: 3 }] };
    const changeset = diff(before, after, { embeddedObjKeys: { items: 'id' } });
    const atomized = atomizeChangeset(changeset);
    expect(atomized).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: Operation.MOVE, key: '1', from: 0, to: 1 }),
        expect.objectContaining({ type: Operation.MOVE, key: '2', from: 1, to: 0 })
      ])
    );

    const rebuilt = unatomizeChangeset(atomized);
    applyChangeset(before, rebuilt);
    expect(before).toEqual(after);
  });
});
