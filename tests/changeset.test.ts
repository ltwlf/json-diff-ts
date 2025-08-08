import { applyChangeset, revertChangeset, diff, Operation } from '../src/jsonDiff';
import * as fixtures from './__fixtures__/jsonDiff.fixture';

let oldObj: any;
let newObj: any;

beforeEach(() => {
  oldObj = fixtures.oldObj();
  newObj = fixtures.newObj();
});

describe('applyChangeset', () => {
  it('applies changeset to oldObj correctly', () => {
    applyChangeset(oldObj, fixtures.changeset);
    newObj.children.sort((a: any, b: any) => (a.name > b.name ? 1 : -1));
    expect(oldObj).toMatchObject(newObj);
  });

  it('applies changesetWithoutKey to oldObj correctly', () => {
    applyChangeset(oldObj, fixtures.changesetWithoutEmbeddedKey);
    expect(oldObj).toEqual(newObj);
  });

  it('ignores removal of non-existing array elements', () => {
    applyChangeset(oldObj, fixtures.changesetWithDoubleRemove);
    newObj.children.sort((a: any, b: any) => (a.name > b.name ? 1 : -1));
    expect(oldObj).toMatchObject(newObj);
  });

  it('correctly applies null values', () => {
    const obj1: { test: string | null } = { test: "foobar" };
    const obj2: { test: string | null } = { test: null };

    const changeset = diff(obj1, obj2);
    const result = applyChangeset(obj1, changeset);
    
    expect(result.test).toBeNull();
  });

  it('correctly applies changes from null to string', () => {
    const obj1: { test: string | null } = { test: null };
    const obj2: { test: string | null } = { test: "foobar" };

    const changeset = diff(obj1, obj2);
    const result = applyChangeset(obj1, changeset);

    expect(result.test).toBe("foobar");
  });

  it('handles array modifications with null and undefined', () => {
    const base = { xyz: [1, 2, 3] };

    const resultNull = applyChangeset(
      JSON.parse(JSON.stringify(base)),
      diff(base, { xyz: [null, 2, 3] })
    );
    expect(resultNull).toEqual({ xyz: [null, 2, 3] });

    const resultUndefined = applyChangeset(
      JSON.parse(JSON.stringify(base)),
      diff(base, { xyz: [1, undefined, 3] })
    );
    expect(resultUndefined).toEqual({ xyz: [1, undefined, 3] });
  });

  it('preserves undefined values in arrays (issue #316)', () => {
    // Test case 1: undefined at beginning of array
    const base1 = { xyz: [1, 2, 3] };
    const target1: { xyz: (number | undefined)[] } = { xyz: [undefined, 2, 3] };
    const result1 = applyChangeset(JSON.parse(JSON.stringify(base1)), diff(base1, target1));
    expect(result1.xyz.length).toBe(3);
    expect(result1.xyz[0]).toBeUndefined();
    expect(result1.xyz[1]).toBe(2);
    expect(result1.xyz[2]).toBe(3);

    // Test case 2: undefined in middle of array
    const base2 = { xyz: [1, 2, 3] };
    const target2: { xyz: (number | undefined)[] } = { xyz: [1, undefined, 3] };
    const result2 = applyChangeset(JSON.parse(JSON.stringify(base2)), diff(base2, target2));
    expect(result2.xyz.length).toBe(3);
    expect(result2.xyz[0]).toBe(1);
    expect(result2.xyz[1]).toBeUndefined();
    expect(result2.xyz[2]).toBe(3);

    // Test case 3: array with only undefined
    const base3 = { xyz: [1] };
    const target3: { xyz: (number | undefined)[] } = { xyz: [undefined] };
    const result3 = applyChangeset(JSON.parse(JSON.stringify(base3)), diff(base3, target3));
    expect(result3.xyz.length).toBe(1);
    expect(result3.xyz[0]).toBeUndefined();

    // Test case 4: object property set to undefined should still be removed (not array context)
    const base4 = { test: 'value' };
    const target4: { test?: string } = { test: undefined };
    const result4 = applyChangeset(JSON.parse(JSON.stringify(base4)), diff(base4, target4));
    expect(result4).toEqual({});
    expect(result4.hasOwnProperty('test')).toBe(false);
  });
});

describe('revertChangeset', () => {
  it('reverts changeset on newObj correctly', () => {
    revertChangeset(newObj, fixtures.changeset);
    expect(oldObj).toEqual(newObj);
  });

  it('reverts changesetWithoutKey on newObj correctly', () => {
    revertChangeset(newObj, fixtures.changesetWithoutEmbeddedKey);
    newObj.children.sort((a: any, b: any) => a.name > b.name);
    expect(oldObj).toEqual(newObj);
  });

  it('correctly reverts null values', () => {
    const obj1: { test: string | null } = { test: "foobar" };
    const obj2: { test: string | null } = { test: null };

    const changeset = diff(obj1, obj2);
    
    // First apply the changeset to get to the null state
    applyChangeset(obj1, changeset);
    expect(obj1.test).toBeNull();
    
    // Now revert the changes
    revertChangeset(obj1, changeset);
    
    expect(obj1.test).toBe("foobar");
  });

  it('should properly revert ADD operation with $root key', () => {
    // The test case from the issue
    const obj = { value: '1' };
    const changeset = [{ key: '$root', type: Operation.ADD, value: { value: '1' } }];
    
    // Expected result is an empty object since we're reverting an ADD operation
    const result = revertChangeset(obj, changeset);
    expect(result).toEqual({});
  });

  it('should properly revert UPDATE operation on a property', () => {
    // The second test case from the issue
    const obj = { value: '2' };
    const changeset = [{ key: 'value', type: Operation.UPDATE, value: '2', oldValue: '1' }];
    
    // Expected result is { value: '1' } since we're reverting an UPDATE operation
    const result = revertChangeset(obj, changeset);
    expect(result).toEqual({ value: '1' });
  });

  it('should handle complex root updates', () => {
    // A more complex case
    const obj = { a: 1, b: 2, c: 3 };
    const changeset = [{ key: '$root', type: Operation.ADD, value: { a: 1, b: 2, c: 3 } }];
    
    // Expected result is an empty object
    const result = revertChangeset(obj, changeset);
    expect(result).toEqual({});
  });

  it('should handle root REMOVE reversion', () => {
    // Reverting a REMOVE operation should restore the object
    const obj = {};
    const changeset = [{ key: '$root', type: Operation.REMOVE, value: { x: 'y', z: 123 } }];
    
    // Expected result is the original object that was removed
    const result = revertChangeset(obj, changeset);
    expect(result).toEqual({ x: 'y', z: 123 });
  });
});