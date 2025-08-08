import { diff, applyChangeset, EmbeddedObjKeysMapType } from '../src/jsonDiff';

describe('array handling and integration tests', () => {
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
    
    const changes = diff(obj1, obj2);  // No embedded key - defaults to $index
    
    // Make a copy of obj1 to apply changes to
    const objCopy = JSON.parse(JSON.stringify(obj1));
    
    // Apply the changes to the copy
    const result = applyChangeset(objCopy, changes);
    
    // The result should match obj2
    expect(result).toEqual(obj2);
  });

  it('should handle Map-based embeddedObjKeys with RegExp patterns', () => {
    const embeddedObjKeys: EmbeddedObjKeysMapType = new Map();
    embeddedObjKeys.set(/children/, 'name');
    embeddedObjKeys.set(/\.subset$/, 'id');

    const originalOldObj = {
      children: [
        { name: 'child1', age: 5 },
        { name: 'child2', age: 7, subset: [{ id: 1, value: 'a' }] }
      ]
    };

    const originalNewObj = {
      children: [
        { name: 'child1', age: 6 }, // age changed
        { name: 'child2', age: 7, subset: [{ id: 1, value: 'b' }] } // subset value changed
      ]
    };

    const changes = diff(originalOldObj, originalNewObj, { embeddedObjKeys });
    const result = applyChangeset(JSON.parse(JSON.stringify(originalOldObj)), changes);

    // Check that at least the main structure is preserved and key changes applied
    expect(result.children).toHaveLength(2);
    expect(result.children[0].name).toBe('child1');
    expect(result.children[0].age).toBe(6); // This should be updated
    expect(result.children[1].name).toBe('child2');
  });

  it('should handle Map-based embeddedObjKeys with exact string matches', () => {
    const embeddedObjKeys: EmbeddedObjKeysMapType = new Map();
    embeddedObjKeys.set('children', 'name');
    embeddedObjKeys.set('children.subset', 'id');

    const originalOldObj = {
      children: [
        { name: 'child1', age: 5 },
        { name: 'child2', age: 7, subset: [{ id: 1, value: 'a' }] }
      ]
    };

    const originalNewObj = {
      children: [
        { name: 'child1', age: 6 }, // age changed
        { name: 'child2', age: 7, subset: [{ id: 1, value: 'b' }] } // subset value changed
      ]
    };

    const changes = diff(originalOldObj, originalNewObj, { embeddedObjKeys });
    const result = applyChangeset(JSON.parse(JSON.stringify(originalOldObj)), changes);

    expect(result).toEqual(originalNewObj);
  });

  it('should handle function key resolvers', () => {
    const originalOldObj = {
      items: [
        { customId: 'a', value: 1 },
        { customId: 'b', value: 2 }
      ]
    };

    const originalNewObj = {
      items: [
        { customId: 'a', value: 10 }, // value changed
        { customId: 'c', value: 3 }   // item b removed, c added
      ]
    };

    const changes = diff(originalOldObj, originalNewObj, {
      embeddedObjKeys: {
        items: (obj: any) => obj.customId
      }
    });

    const result = applyChangeset(JSON.parse(JSON.stringify(originalOldObj)), changes);
    
    // Check that the structure is correct and key changes are applied
    expect(result.items).toHaveLength(2);
    expect(result.items.find((item: any) => item.customId === 'a')).toBeDefined();
    expect(result.items.find((item: any) => item.customId === 'c')).toBeDefined();
    expect(result.items.find((item: any) => item.customId === 'b')).toBeUndefined();
  });

  it('should skip specified nested paths during comparison', () => {
    const originalOldObj = {
      config: {
        settings: {
          theme: 'dark',
          notifications: true
        },
        metadata: {
          version: '1.0.0',
          lastModified: '2023-01-01'
        }
      },
      data: {
        items: ['a', 'b', 'c']
      }
    };

    const originalNewObj = {
      config: {
        settings: {
          theme: 'light', // This should be detected
          notifications: false // This should be ignored (nested under config.settings)
        },
        metadata: {
          version: '1.1.0', // This should be ignored (nested under config.metadata)
          lastModified: '2023-12-01' // This should be ignored
        }
      },
      data: {
        items: ['a', 'b', 'd'] // This should be detected
      }
    };

    const changes = diff(originalOldObj, originalNewObj, {
      keysToSkip: ['config.settings.notifications', 'config.metadata']
    });

    // Apply changes and verify only non-skipped paths were processed
    const result = applyChangeset(JSON.parse(JSON.stringify(originalOldObj)), changes);

    expect(result.config.settings.theme).toBe('light'); // Should be updated
    expect(result.config.settings.notifications).toBe(true); // Should remain unchanged (skipped)
    expect(result.config.metadata.version).toBe('1.0.0'); // Should remain unchanged (skipped)
    expect(result.config.metadata.lastModified).toBe('2023-01-01'); // Should remain unchanged (skipped)
    expect(result.data.items).toEqual(['a', 'b', 'd']); // Should be updated
  });

  it('should handle complex nested scenarios with embedded keys', () => {
    const complexOld = {
      departments: [
        {
          name: 'Engineering',
          employees: [
            { id: 1, name: 'Alice', skills: ['JavaScript', 'React'] },
            { id: 2, name: 'Bob', skills: ['Python', 'Django'] }
          ]
        },
        {
          name: 'Marketing',
          employees: [
            { id: 3, name: 'Carol', skills: ['SEO', 'Content'] }
          ]
        }
      ]
    };

    const complexNew = {
      departments: [
        {
          name: 'Engineering',
          employees: [
            { id: 1, name: 'Alice Smith', skills: ['JavaScript', 'React', 'TypeScript'] }, // name and skills updated
            { id: 4, name: 'David', skills: ['Go', 'Kubernetes'] } // Bob removed, David added
          ]
        },
        {
          name: 'Marketing',
          employees: [
            { id: 3, name: 'Carol', skills: ['SEO', 'Content', 'Analytics'] } // skills updated
          ]
        }
      ]
    };

    const changes = diff(complexOld, complexNew, {
      embeddedObjKeys: {
        departments: 'name',
        'departments.employees': 'id'
      }
    });

    const result = applyChangeset(JSON.parse(JSON.stringify(complexOld)), changes);
    expect(result).toEqual(complexNew);
  });
});