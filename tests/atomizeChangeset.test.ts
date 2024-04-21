import { diff, atomizeChangeset } from '../src/jsonDiff';

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
    expect(actual[0].path).toBe('$[a.b]');
    expect(actual[1].path).toBe("$[a.b][?(@.c=='1')]");
    done();
  });

  test('when embedded key name contains periods', (done) => {
    const oldObject = { a: [{ b: 1, 'c.d': 10 }] };
    const newObject = { a: [{ b: 2, 'c.d': 20 }] };
    const diffs = diff(oldObject, newObject, { embeddedObjKeys: { a: 'c.d' } });

    const actual = atomizeChangeset(diffs);

    expect(actual.length).toBe(2);
    expect(actual[0].path).toBe('$.a');
    expect(actual[1].path).toBe("$.a[?(@[c.d]=='10')]");
    done();
  });
});
