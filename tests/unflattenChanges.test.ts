import { diff, flattenChangeset, unflattenChanges, applyChangeset } from '../src/jsonDiff';

describe('unflattenChanges', () => {
  test('handles flatten changeset properly', (done) => {
    const oldObject = { a: [{ b: [{ c: 'd' }] }] };
    const newObject = { a: [{ b: [{ c: 'e' }] }] };
    const diffs = diff(oldObject, newObject);

    expect(applyChangeset(oldObject, unflattenChanges(flattenChangeset(diffs)))).toEqual(newObject)

    done();
  });
});
