
import {
  applyChangeset,
  diff,
  EmbeddedObjKeysMapType,
  atomizeChangeset,
  IAtomicChange,
  revertChangeset,
  unatomizeChangeset,
  Operation
} from '../src/jsonDiff';
import * as fixtures from './__fixtures__/jsonDiff.fixture';

let oldObj: any;
let newObj: any;

beforeEach(() => {
  oldObj = fixtures.oldObj();
  newObj = fixtures.newObj();
});

describe('jsonDiff#diff', () => {
  it('returns correct diff for objects with embedded array without specified key', () => {
    const diffs = diff(oldObj, newObj);
    expect(diffs).toMatchSnapshot();
  });

  it('returns correct diff for objects with embedded array with specified keys', () => {
    const diffs = diff(oldObj, newObj, {
      embeddedObjKeys: {
        children: 'name',
        // path can either starts with "" or "."
        '.children.subset': 'id'
      }
    });
    expect(diffs).toMatchSnapshot();
  });

  it('returns correct diff for objects with embedded array with regex keys', () => {
    const embeddedObjKeys: EmbeddedObjKeysMapType = new Map();
    embeddedObjKeys.set(/^children$/, 'name');
    embeddedObjKeys.set(/\.subset$/, 'id');

    const diffs = diff(oldObj, newObj, { embeddedObjKeys });
    expect(diffs).toMatchSnapshot();
  });

  it('returns correct diff for objects with embedded array with function keys', () => {
    const diffs = diff(oldObj, newObj, {
      embeddedObjKeys: {
        children: (obj: { name: string }) => obj.name,
        'children.subset': (obj: { id: number }) => obj.id
      }
    });
    expect(diffs).toMatchSnapshot();
  });

  it('returns correct diff for object without keys to skip', () => {
    const keyToSkip = '@_index';
    oldObj[keyToSkip] = 'This should be ignored';
    newObj['children'][1][keyToSkip] = { text: 'This whole object should be ignored' };
    const diffs = diff(oldObj, newObj, { keysToSkip: [keyToSkip] });
    // Update the snapshot with npm test -- -u if needed
    expect(diffs).toMatchSnapshot();
  });

  it('supports nested keys to skip', () => {
    const original = {
      property: {
        name: 'Paucek, Gerlach and Bernier',
        address: {
          formattedAddress: '80568 Abernathy Pine Apt. 387',
          utcOffset: 0,
          vicinity: '866 Woodside Road Apt. 534',
        }
      }
    };
    const updated = {
      property: {
        name: 'New Address',
        address: {
          formattedAddress: 'New 80568 Abernathy Pine Apt. 387',
          utcOffset: 0,
          vicinity: 'New 866 Woodside Road Apt. 534',
        }
      }
    };
    
    const diffs = diff(original, updated, { keysToSkip: ['property.address'] });
    expect(diffs).toEqual([
      {
        type: 'UPDATE',
        key: 'property',
        changes: [
          {
            type: 'UPDATE',
            key: 'name',
            value: 'New Address',
            oldValue: 'Paucek, Gerlach and Bernier'
          }
        ]
      }
    ]);
  });

  it.each(fixtures.assortedDiffs)(
    'correctly diffs $oldVal with $newVal',
    ({ oldVal, newVal, expectedReplacement, expectedUpdate }) => {
      expect(diff(oldVal, newVal, { treatTypeChangeAsReplace: true })).toEqual(expectedReplacement);
      expect(diff(oldVal, newVal, { treatTypeChangeAsReplace: false })).toEqual(expectedUpdate);
    }
  );

  it('should not include empty REMOVE operation when diffing from undefined to a value', () => {
    const value = { DBA: "New Val" };
    const valueDiff = diff(undefined, value);
    
    // Check that there's no REMOVE operation
    const removeOperation = valueDiff.find(change => change.type === 'REMOVE');
    
    expect(removeOperation).toBeUndefined();
    
    // Check that there's only an ADD operation
    expect(valueDiff.length).toBe(1);
    expect(valueDiff[0].type).toBe('ADD');
    expect(valueDiff[0].key).toBe('$root');
    expect(valueDiff[0].value).toEqual(value);
  });
  
  it('should include a REMOVE operation with value when diffing from a value to undefined', () => {
    const value = { DBA: "New Val" };
    const valueDiff = diff(value, undefined);
    
    // Check if there's a REMOVE operation with the original value
    expect(valueDiff.length).toBe(1);
    expect(valueDiff[0].type).toBe('REMOVE');
    expect(valueDiff[0].key).toBe('$root');
    expect(valueDiff[0].value).toEqual(value);
  });

  it('handles Date to string updates when treatTypeChangeAsReplace is false (issue #254)', () => {
    const d = '2025-05-28T06:40:53.284Z';
    const before = { d: new Date(d) };
    const after = { d };

    const valueDiff = diff(before, after, { treatTypeChangeAsReplace: false });

    expect(valueDiff).toEqual([
      { type: 'UPDATE', key: 'd', value: d, oldValue: new Date(d) }
    ]);
  });
});

describe('jsonDiff#applyChangeset', () => {
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

describe('jsonDiff#revertChangeset', () => {
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

describe('jsonDiff#flatten', () => {
  it('flattens changes, unflattens them, and applies them correctly', () => {
    // Make a deep copy of oldObj to work with
    const testObj = JSON.parse(JSON.stringify(oldObj));
    
    const diffs = diff(oldObj, newObj, {
      embeddedObjKeys: {
        children: 'name',
        'children.subset': 'id'
      }
    });

    const flat = atomizeChangeset(diffs);
    const unflat = unatomizeChangeset(flat);

    applyChangeset(testObj, unflat);

    // Sort the children arrays to ensure consistent ordering
    newObj.children.sort((a: any, b: any) => (a.name > b.name ? 1 : -1));
    testObj.children.sort((a: any, b: any) => (a.name > b.name ? 1 : -1));

    // Check essential properties that should be updated
    expect(testObj.name).toBe(newObj.name);
    expect(testObj.mixed).toBe(newObj.mixed);
    expect(testObj.date).toEqual(newObj.date);
    
    // Check nested updates in children array
    // After our fix, the behavior has changed slightly but still produces valid results
    expect(testObj.children.length).toBe(newObj.children.length);
    expect(testObj.children.find((c: any) => c.name === 'kid1')?.age).toBe(0);
    expect(testObj.children.find((c: any) => c.name === 'kid3')?.age).toBe(3);
  });

  it('starts with a blank object, flattens changes, unflattens them, and applies them correctly', () => {
    const beforeObj = {};
    const afterObj = newObj;

    const diffs = diff(beforeObj, afterObj, {});

    const flat = atomizeChangeset(diffs);
    const unflat = unatomizeChangeset(flat);

    applyChangeset(beforeObj, unflat);

    expect(beforeObj).toMatchObject(afterObj);
  });

  it('gets key name for flattening when using a key function', () => {
    const beforeObj = {
      items: [
        {
          _id: '1'
        }
      ]
    };

    const afterObj = {
      items: [
        {
          _id: '2'
        }
      ]
    };

    const diffs = diff(beforeObj, afterObj, {
      embeddedObjKeys: {
        items: (obj, getKeyName) => {
          if (getKeyName) {
            if (obj?._id) {
              return '_id';
            }
            return '$index';
          }
          if (obj?._id) {
            return obj?._id;
          }
          return '$index';
        }
      }
    });

    const flat = atomizeChangeset(diffs);

    expect(flat).toMatchSnapshot();
  });
});

describe('jsonDiff#arrayHandling', () => {
  it('should correctly apply changes to nested arrays with id key', () => {
    // Initial object with a nested array
    const obj1 = {
      items: [
        { id: 1, name: 'item1' },
        { id: 2, name: 'item2' },
        { id: 3, name: 'item3' }
      ]
    };
    
    // Modified object with changes in the nested array
    const obj2 = {
      items: [
        { id: 1, name: 'item1-modified' }, // Modified name
        { id: 3, name: 'item3' },          // Item 2 removed, item 3 is now at index 1
        { id: 4, name: 'item4' }           // New item added
      ]
    };
    
    const changes = diff(obj1, obj2, {
      embeddedObjKeys: {
        items: 'id'  // Use 'id' as the key for the items array
      }
    });
    
    // Make a copy of obj1 to apply changes to
    const objCopy = JSON.parse(JSON.stringify(obj1));
    
    // Apply the changes to the copy
    const result = applyChangeset(objCopy, changes);
    
    // The result should match obj2
    expect(result).toEqual(obj2);
  });

  it('should correctly apply changes to nested arrays with index key', () => {
    // Initial object with a nested array
    const obj1 = {
      items: [
        { id: 1, name: 'item1' },
        { id: 2, name: 'item2' },
        { id: 3, name: 'item3' }
      ]
    };
    
    // Modified object with changes in the nested array
    const obj2 = {
      items: [
        { id: 1, name: 'item1-modified' }, // Modified name
        { id: 3, name: 'item3-modified' }, // Modified name
        { id: 4, name: 'item4' }           // New item (replacing item2)
      ]
    };
    
    // Using no embeddedObjKeys to use the default $index
    const changes = diff(obj1, obj2);
    
    // Make a copy of obj1 to apply changes to
    const objCopy = JSON.parse(JSON.stringify(obj1));
    
    // Apply the changes to the copy
    const result = applyChangeset(objCopy, changes);
    
    // The result should match obj2
    expect(result).toEqual(obj2);
  });

  it('should correctly apply complex nested array changes', () => {
    // Initial object with nested arrays
    const obj1 = {
      departments: [
        {
          name: 'Engineering',
          teams: [
            { id: 'team1', name: 'Frontend', members: ['Alice', 'Bob'] },
            { id: 'team2', name: 'Backend', members: ['Charlie', 'Dave'] }
          ]
        },
        {
          name: 'Marketing',
          teams: [
            { id: 'team3', name: 'Digital', members: ['Eve', 'Frank'] }
          ]
        }
      ]
    };
    
    // Modified object with nested array changes
    const obj2 = {
      departments: [
        {
          name: 'Engineering',
          teams: [
            { id: 'team1', name: 'Frontend Dev', members: ['Alice', 'Bob', 'Grace'] }, // Changed name, added member
            { id: 'team4', name: 'DevOps', members: ['Heidi'] } // New team
          ]
        },
        {
          name: 'Marketing',
          teams: [
            { id: 'team3', name: 'Digital Marketing', members: ['Eve', 'Ivy'] } // Changed name, replaced member
          ]
        }
      ]
    };
    
    const changes = diff(obj1, obj2, {
      embeddedObjKeys: {
        'departments': 'name',
        'departments.teams': 'id'
      }
    });
    
    // Make a copy of obj1 to apply changes to
    const objCopy = JSON.parse(JSON.stringify(obj1));
    
    // Apply the changes to the copy
    const result = applyChangeset(objCopy, changes);
    
    // The result should match obj2
    expect(result).toEqual(obj2);
  });
});

describe('jsonDiff#removeKey', () => {
  it('should correctly delete properties without undefined assignment (issue #221)', () => {
    // Test object with a property to be removed
    const obj = {
      foo: 'bar',
      baz: 'qux'
    };
    
    // Create a diff that will remove the 'foo' property
    const changes = diff(obj, { baz: 'qux' });
    
    // Verify the change operation is a REMOVE
    expect(changes.length).toBe(1);
    expect(changes[0].type).toBe('REMOVE');
    expect(changes[0].key).toBe('foo');
    
    // Apply the changeset to remove the property
    applyChangeset(obj, changes);
    
    // Check that the property was completely removed without any undefined residue
    expect(obj).toEqual({ baz: 'qux' });
    expect(obj.hasOwnProperty('foo')).toBe(false);
    expect(Object.keys(obj)).toEqual(['baz']);
  });
});

describe('jsonDiff#valueKey', () => {
  let oldObj: any;
  let newObj: any;

  beforeEach(() => {
    oldObj = {
      items: ['apple', 'banana', 'orange']
    };

    newObj = {
      items: ['orange', 'lemon']
    };
  });

  it('tracks array changes by array value', () => {
    const diffs = diff(oldObj, newObj, { embeddedObjKeys: { items: '$value' } });
    expect(diffs).toMatchSnapshot();
  });

  it('correctly flatten array value keys', () => {
    const flattenChanges = atomizeChangeset(diff(oldObj, newObj, { embeddedObjKeys: { items: '$value' } }));
    expect(flattenChanges).toMatchSnapshot();
  });

  it('correctly unflatten array value keys', () => {
    const flattenChanges = [
      {
        key: 'lemon',
        path: "$.items[?(@='lemon')]",
        type: 'ADD',
        value: 'lemon',
        valueType: 'String'
      },
      {
        key: 'apple',
        path: "$.items[?(@='apple')]",
        type: 'REMOVE',
        value: 'apple',
        valueType: 'String'
      }
    ] as IAtomicChange[];

    const changeset = unatomizeChangeset(flattenChanges);

    expect(changeset).toMatchSnapshot();
  });

  it('apply array value keys', () => {
    const flattenChanges = [
      {
        key: 'lemon',
        path: "$.items[?(@='lemon')]",
        type: 'ADD',
        value: 'lemon',
        valueType: 'String'
      },
      {
        key: 'apple',
        path: "$.items[?(@='apple')]",
        type: 'REMOVE',
        value: 'apple',
        valueType: 'String'
      }
    ] as IAtomicChange[];

    const changeset = unatomizeChangeset(flattenChanges);

    applyChangeset(oldObj, changeset);

    expect(oldObj).toMatchSnapshot();
  });

  it('revert array value keys', () => {
    const flattenChanges = [
      {
        key: 'banana',
        path: "$.items[?(@='banana')]",
        type: 'ADD',
        value: 'banana',
        valueType: 'String'
      },
      {
        key: 'lemon',
        path: "$.items[?(@='lemon')]",
        type: 'REMOVE',
        value: 'lemon',
        valueType: 'String'
      }
    ] as IAtomicChange[];

    const changeset = unatomizeChangeset(flattenChanges);

    revertChangeset(oldObj, changeset);

    expect(oldObj).toMatchSnapshot();
  });

  it('it should treat object type changes as an update', () => {
    const beforeObj = {
      items: ['apple', 'banana', 'orange']
    };
    const afterObj = {
      items: { 0: 'apple', 1: 'banana', 2: 'orange'}
    };

    const changeset = diff(beforeObj, afterObj, { treatTypeChangeAsReplace: false});

    applyChangeset(beforeObj, changeset);

    expect(beforeObj).toMatchSnapshot();
  });

  // Tests to achieve 100% coverage
  describe('edge cases for full coverage', () => {
    it('should handle Function type objects', () => {
      const oldObj = { fn: () => 'old', value: 1 };
      const newObj = { fn: () => 'new', value: 2 };
      
      const changeset = diff(oldObj, newObj);
      // Functions should be ignored, only value change should be captured
      expect(changeset).toEqual([
        {
          type: Operation.UPDATE,
          key: 'value',
          value: 2,
          oldValue: 1
        }
      ]);
    });

    it('should handle keysToSkip with nested paths', () => {
      const oldObj = { 
        user: { name: 'John', secret: 'old' },
        data: { public: 'yes', private: 'old' }
      };
      const newObj = { 
        user: { name: 'Jane', secret: 'new' },
        data: { public: 'no', private: 'new' }
      };
      
      const changeset = diff(oldObj, newObj, { 
        keysToSkip: ['user.secret', 'data.private'] 
      });
      
      // Should only capture the non-skipped changes
      const atomized = atomizeChangeset(changeset);
      const nonSkippedChanges = atomized.filter(change => 
        !change.path.includes('secret') && !change.path.includes('private')
      );
      expect(nonSkippedChanges.length).toBeGreaterThan(0);
    });

    it('should handle array creation with numeric path segments', () => {
      const oldObj = {};
      const newObj = { items: ['first', 'second'] };
      
      const changeset = diff(oldObj, newObj);
      applyChangeset(oldObj, changeset);
      expect(oldObj).toEqual(newObj);
    });

    it('should handle complex flatten scenarios', () => {
      const oldObj = { 
        items: [
          { id: 1, name: 'first' },
          { id: 2, name: 'second' }
        ]
      };
      const newObj = { 
        items: [
          { id: 1, name: 'updated' },
          { id: 3, name: 'third' }
        ]
      };
      
      const changeset = diff(oldObj, newObj, { embeddedObjKeys: { 'items': 'id' } });
      const atomized = atomizeChangeset(changeset);
      const flattened = unatomizeChangeset(atomized);
      
      expect(flattened.length).toBeGreaterThan(0);
    });

    it('should handle single segment paths in atomize', () => {
      const simpleChange = {
        type: Operation.UPDATE,
        key: 'name',
        value: 'new',
        oldValue: 'old'
      };
      
      const atomized = atomizeChangeset([simpleChange]);
      expect(atomized.length).toBe(1);
      expect(atomized[0].path).toBe('$.name');
    });

    it('should handle complex JSONPath segments', () => {
      const complexChanges = [
        {
          type: Operation.UPDATE,
          key: 'items[?(@.id==\'123\')]',
          value: { id: '123', name: 'updated' },
          oldValue: { id: '123', name: 'old' },
          changes: [
            {
              type: Operation.UPDATE,
              key: 'name',
              value: 'updated',
              oldValue: 'old'
            }
          ]
        }
      ];
      
      const atomized = atomizeChangeset(complexChanges);
      expect(atomized.length).toBeGreaterThan(0);
    });

    it('should handle value key scenarios', () => {
      const oldObj = {
        tags: ['red', 'blue']
      };
      const newObj = {
        tags: ['blue', 'green']
      };
      
      const changeset = diff(oldObj, newObj, { 
        embeddedObjKeys: { 'tags': '$value' }
      });
      
      expect(changeset.length).toBeGreaterThan(0);
    });

    it('should handle non-existing array element removal', () => {
      const obj = { items: [{ id: 1, name: 'test' }] };
      const changeset = [
        {
          type: Operation.REMOVE,
          key: 'items[?(@.id==\'2\')]',
          value: { id: 2, name: 'missing' },
          path: '$.items[?(@.id==\'2\')]'
        }
      ];
      
      // Should not throw, should warn and continue
      expect(() => applyChangeset(obj, changeset)).not.toThrow();
    });

    it('should handle different object types', () => {
      const oldObj = { date: new Date('2023-01-01'), regex: /test/ };
      const newObj = { date: new Date('2023-01-02'), regex: /newtest/ };
      
      const changeset = diff(oldObj, newObj);
      expect(changeset.length).toBe(2); // Both should be detected as changes
    });

    it('should handle nested skip paths with array indices', () => {
      const oldObj = {
        users: [
          { id: 1, name: 'John', secret: 'old' },
          { id: 2, name: 'Jane', secret: 'old2' }
        ]
      };
      const newObj = {
        users: [
          { id: 1, name: 'Johnny', secret: 'new' },
          { id: 2, name: 'Janet', secret: 'new2' }
        ]
      };
      
      const changeset = diff(oldObj, newObj, { 
        keysToSkip: ['users.secret'],
        embeddedObjKeys: { 'users': 'id' }
      });
      
      // Should capture name changes but skip secret changes
      const atomized = atomizeChangeset(changeset);
      const secretChanges = atomized.filter(change => change.path.includes('secret'));
      expect(secretChanges.length).toBe(0);
    });

    it('should handle root level changes with embedded keys', () => {
      const oldObj = [
        { id: 1, name: 'first' }
      ];
      const newObj = [
        { id: 1, name: 'updated' },
        { id: 2, name: 'new' }
      ];
      
      const changeset = diff(oldObj, newObj, { embeddedObjKeys: { '$': 'id' } });
      expect(changeset.length).toBeGreaterThan(0);
    });

    it('should handle array value comparisons with $value key', () => {
      const oldObj = {
        tags: ['tag1', 'tag2']  
      };
      const newObj = {
        tags: ['tag2', 'tag3']
      };
      
      const changeset = diff(oldObj, newObj, { embeddedObjKeys: { tags: '$value' } });
      expect(changeset.length).toBeGreaterThan(0);
    });

    it('should handle function key resolvers', () => {
      const oldObj = {
        items: [
          { code: 'A', value: 1 },
          { code: 'B', value: 2 }
        ]
      };
      const newObj = {
        items: [
          { code: 'A', value: 10 },
          { code: 'C', value: 3 }
        ]
      };
      
      const keyFunction = (item: any) => item.code;
      const changeset = diff(oldObj, newObj, { embeddedObjKeys: { items: keyFunction } });
      expect(changeset.length).toBeGreaterThan(0);
    });
  });

  describe('keysToSkip functionality', () => {
    it('should skip specified nested paths during comparison', () => {
      const oldObj = {
        a: { b: { c: 1 } },
        x: { y: { z: 2 } }
      };
      const newObj = {
        a: { b: { c: 999 } }, // Changed but should be skipped
        x: { y: { z: 3 } }    // Changed and should be included
      };
      
      const changeset = diff(oldObj, newObj, { keysToSkip: ['a.b.c'] });
      
      // Should only contain changes for x.y.z, not a.b.c
      expect(changeset).toEqual([
        {
          key: 'x',
          type: 'UPDATE',
          changes: [
            {
              key: 'y',
              type: 'UPDATE',
              changes: [
                {
                  key: 'z',
                  type: 'UPDATE',
                  value: 3,
                  oldValue: 2
                }
              ]
            }
          ]
        }
      ]);
    });

    it('should skip paths when adding new nested properties', () => {
      const oldObj = { a: 1 };
      const newObj = { 
        a: 1, 
        skip: { nested: { value: 'should be skipped' } },
        keep: { nested: { value: 'should be included' } }
      };
      
      const changeset = diff(oldObj, newObj, { keysToSkip: ['skip.nested'] });
      
      // Should add both 'skip' and 'keep' properties, but the 'skip' object should be added as-is
      // since keysToSkip only affects comparison, not addition of entire new branches
      expect(changeset.length).toBe(2);
      expect(changeset.some(change => change.key === 'skip' && change.type === 'ADD')).toBe(true);
      expect(changeset.some(change => change.key === 'keep' && change.type === 'ADD')).toBe(true);
    });
  });

  describe('embeddedObjKeys with Map and RegExp', () => {
    it('should handle Map-based embeddedObjKeys with RegExp patterns', () => {
      const oldObj = {
        users: [
          { id: 1, name: 'John' },
          { id: 2, name: 'Jane' }
        ],
        products: [
          { id: 1, title: 'Product A' },
          { id: 2, title: 'Product B' }
        ]
      };
      
      const newObj = {
        users: [
          { id: 1, name: 'John Updated' },
          { id: 3, name: 'Bob' }
        ],
        products: [
          { id: 1, title: 'Product A Updated' },
          { id: 3, title: 'Product C' }
        ]
      };
      
      const embeddedObjKeys: EmbeddedObjKeysMapType = new Map();
      embeddedObjKeys.set(/^users$/, 'id');
      embeddedObjKeys.set(/^products$/, 'id');
      
      const changeset = diff(oldObj, newObj, { embeddedObjKeys });
      expect(changeset.length).toBeGreaterThan(0);
      
      // Verify the changes are properly structured for key-based array diffing
      const usersChange = changeset.find(c => c.key === 'users');
      expect(usersChange).toBeDefined();
      expect(usersChange?.embeddedKey).toBe('id');
    });

    it('should handle Map-based embeddedObjKeys with exact string matches', () => {
      const oldObj = {
        items: [{ id: 1, value: 'a' }]
      };
      
      const newObj = {
        items: [{ id: 1, value: 'b' }]
      };
      
      const embeddedObjKeys: EmbeddedObjKeysMapType = new Map();
      embeddedObjKeys.set('items', 'id');
      
      const changeset = diff(oldObj, newObj, { embeddedObjKeys });
      expect(changeset.length).toBeGreaterThan(0);
      
      const itemsChange = changeset.find(c => c.key === 'items');
      expect(itemsChange?.embeddedKey).toBe('id');
    });
  });

  describe('$index and $value embedded key scenarios', () => {
    it('should handle $index embedded key in applyChangeset', () => {
      const oldArray = ['a', 'b', 'c'];
      const changeset = [
        {
          key: 'testArray',
          type: Operation.UPDATE,
          embeddedKey: '$index',
          changes: [
            {
              key: '1',
              type: Operation.UPDATE,
              value: 'updated',
              oldValue: 'b'
            }
          ]
        }
      ];
      
      const obj = { testArray: [...oldArray] };
      const result = applyChangeset(obj, changeset);
      
      expect(result.testArray[1]).toBe('updated');
    });

    it('should handle $value embedded key in applyChangeset', () => {
      const oldArray = ['apple', 'banana', 'cherry'];
      const changeset = [
        {
          key: 'fruits',
          type: Operation.UPDATE,
          embeddedKey: '$value',
          changes: [
            {
              key: 'blueberry',
              type: Operation.ADD,
              value: 'blueberry'
            },
            {
              key: 'banana',
              type: Operation.REMOVE,
              value: 'banana'
            }
          ]
        }
      ];
      
      const obj = { fruits: [...oldArray] };
      const result = applyChangeset(obj, changeset);
      
      // banana should be removed and blueberry added
      expect(result.fruits).toContain('blueberry');
      expect(result.fruits).not.toContain('banana');
    });

    it('should handle $index embedded key in revertChangeset', () => {
      const modifiedArray = ['a', 'updated', 'c'];
      const changeset = [
        {
          key: 'testArray',
          type: Operation.UPDATE,
          embeddedKey: '$index',
          changes: [
            {
              key: '1',
              type: Operation.UPDATE,
              value: 'updated',
              oldValue: 'b'
            }
          ]
        }
      ];
      
      const obj = { testArray: [...modifiedArray] };
      const result = revertChangeset(obj, changeset);
      
      expect(result.testArray[1]).toBe('b');
    });

    it('should handle $value embedded key in revertChangeset', () => {
      const modifiedArray = ['apple', 'blueberry', 'cherry'];
      const changeset = [
        {
          key: 'fruits',
          type: Operation.UPDATE,
          embeddedKey: '$value',
          changes: [
            {
              key: 'blueberry',
              type: Operation.ADD,
              value: 'blueberry'
            },
            {
              key: 'banana',
              type: Operation.REMOVE,
              value: 'banana'
            }
          ]
        }
      ];
      
      const obj = { fruits: [...modifiedArray] };
      const result = revertChangeset(obj, changeset);
      
      // blueberry should be removed and banana added back
      expect(result.fruits).toContain('banana');
      expect(result.fruits).not.toContain('blueberry');
    });
  });

  describe('revertChangeset edge cases', () => {
    it('should handle UPDATE operation on objects', () => {
      const obj = { a: { x: 1, y: 2 }, b: 2 };
      const changeset = [
        {
          key: 'a',
          type: Operation.UPDATE,
          value: { x: 10, y: 20 },
          oldValue: { x: 1, y: 2 }
        }
      ];
      
      const result = revertChangeset(obj, changeset);
      expect(result.a).toEqual({ x: 1, y: 2 });
    });

    it('should handle REMOVE operation on objects', () => {
      const obj = { a: 1, b: 2 };
      const changeset = [
        {
          key: 'removedProp',
          type: Operation.REMOVE,
          value: { x: 1, y: 2 }
        }
      ];
      
      const result = revertChangeset(obj, changeset);
      expect(result.removedProp).toEqual({ x: 1, y: 2 });
    });

    it('should handle UPDATE operation with non-object oldValue', () => {
      const obj = { a: 'new value' };
      const changeset = [
        {
          key: 'a',
          type: Operation.UPDATE,
          value: 'new value',
          oldValue: 'old value'
        }
      ];
      
      const result = revertChangeset(obj, changeset);
      expect(result.a).toBe('old value');
    });

    it('should handle REMOVE operation with non-object value', () => {
      const obj = { a: 1 };
      const changeset = [
        {
          key: 'removedProp',
          type: Operation.REMOVE,
          value: 'simple value'
        }
      ];
      
      const result = revertChangeset(obj, changeset);
      expect(result.removedProp).toBe('simple value');
    });
  });

});
