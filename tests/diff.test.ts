import { diff, EmbeddedObjKeysMapType } from '../src/jsonDiff';
import * as fixtures from './__fixtures__/jsonDiff.fixture';

let oldObj: any;
let newObj: any;

beforeEach(() => {
  oldObj = fixtures.oldObj();
  newObj = fixtures.newObj();
});

describe('diff', () => {
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