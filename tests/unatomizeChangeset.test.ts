import { diff, atomizeChangeset, unatomizeChangeset, applyChangeset } from '../src/jsonDiff';

describe('unatomizeChangeset', () => {

  test('unatomizeChangeset changeset', (done) => {
    const oldObject = { a: [{ b: [{ c: 'd' }] }] };
    const newObject = { a: [{ b: [{ c: 'e' }] }] };
    const diffs = diff(oldObject, newObject);

    expect(applyChangeset(oldObject, unatomizeChangeset(atomizeChangeset(diffs)))).toEqual(newObject)

    done();
  });

  test('when using an embedded key on diff', (done) => {

    const oldData = {
      characters: [
        { id: 'LUK', name: 'Luke Skywalker' },
        { id: 'LEI', name: 'Leia Organa' }
      ]
    };

    const newData = {
      characters: [
        { id: 'LUK', name: 'Luke' },
        { id: 'LEI', name: 'Leia Organa' }
      ]
    };

    const actual = atomizeChangeset(diff(oldData, newData, { embeddedObjKeys: { characters: 'id' } }))[0];
    expect(actual.path).toBe(`$.characters[?(@.id=='LUK')].name`);
    const unflattened = unatomizeChangeset(actual);


    expect(unflattened[0].key).toBe('characters')
    expect(unflattened[0].changes?.[0]?.key).toBe('LUK')

    done();
  });

  test('when using an embedded key on diff and data key has periods', (done) => {

    const oldData = {
      characters: [
        { id: 'LUK.A', name: 'Luke Skywalker' },
        { id: 'LEI.B', name: 'Leia Organa' }
      ]
    };

    const newData = {
      characters: [
        { id: 'LUK.A', name: 'Luke' },
        { id: 'LEI.B', name: 'Leia Organa' }
      ]
    };

    const difference = diff(oldData, newData, { embeddedObjKeys: { characters: 'id' } })

    const actual = atomizeChangeset(difference)[0];
    expect(actual.path).toBe(`$.characters[?(@.id=='LUK.A')].name`);

    const unflattened = unatomizeChangeset(actual);

    expect(unflattened[0].key).toBe('characters')
    expect(unflattened[0].changes?.[0]?.key).toBe('LUK.A')

    done();
  });


});