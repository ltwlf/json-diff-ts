import { diff, flattenChangeset, unflattenChanges } from '../src/jsonDiff';

describe('unflattenChanges', () => {
  
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

    const actual = flattenChangeset(diff(oldData, newData, { characters: 'id' }))[0];
    expect(actual.path).toBe(`$.characters[?(@.id=='LUK')].name`);
    const unflattened = unflattenChanges(actual);


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

    const difference = diff(oldData, newData, { characters: 'id' })

    const actual = flattenChangeset(difference)[0];
    expect(actual.path).toBe(`$.characters[?(@.id=='LUK.A')].name`);

    console.log('actual', actual)

    const unflattened = unflattenChanges(actual);

    expect(unflattened[0].key).toBe('characters')
    expect(unflattened[0].changes?.[0]?.key).toBe('LUK.A')

    done();
  });

});
