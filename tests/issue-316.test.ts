import { diff, applyChangeset } from '../src/jsonDiff';

// Test for issue #316 - specific cases mentioned in the issue
describe('Issue #316 - applyChangeset does not work correctly with array modifications', () => {
  it('should correctly handle null array element modification', () => {
    // Test case 1 from issue: applyChangeset({ xyz:[1,2,3] }, diff({ xyz:[1,2,3] }, { xyz:[null,2,3] }))
    // Expected: { xyz:[null,2,3] }, was returning: { xyz: [] }
    const result = applyChangeset({ xyz: [1, 2, 3] }, diff({ xyz: [1, 2, 3] }, { xyz: [null, 2, 3] }));
    expect(result).toEqual({ xyz: [null, 2, 3] });
  });

  it('should correctly handle undefined array element modification', () => {
    // Test case 2 from issue: applyChangeset({ xyz:[1,2,3] }, diff({ xyz:[1,2,3] }, { xyz:[1,undefined,3] }))
    // Expected: something representing [1,undefined,3], was returning: { xyz: [ 1 ] }
    const result = applyChangeset({ xyz: [1, 2, 3] }, diff({ xyz: [1, 2, 3] }, { xyz: [1, undefined, 3] }));
    
    // Verify the array structure is preserved with undefined
    expect(result.xyz.length).toBe(3);
    expect(result.xyz[0]).toBe(1);
    expect(result.xyz[1]).toBeUndefined();
    expect(result.xyz[2]).toBe(3);
  });

  it('should maintain roundtrip fidelity for array modifications', () => {
    // Test roundtrip: original -> diff -> apply -> should equal target
    const original = { xyz: [1, 2, 3] };
    const targetNull = { xyz: [null, 2, 3] };
    const targetUndefined = { xyz: [1, undefined, 3] };

    // Test null case roundtrip
    const nullDiff = diff(original, targetNull);
    const nullResult = applyChangeset(JSON.parse(JSON.stringify(original)), nullDiff);
    expect(nullResult).toEqual(targetNull);

    // Test undefined case roundtrip
    const undefinedDiff = diff(original, targetUndefined);
    const undefinedResult = applyChangeset(JSON.parse(JSON.stringify(original)), undefinedDiff);
    expect(undefinedResult.xyz.length).toBe(targetUndefined.xyz.length);
    expect(undefinedResult.xyz[0]).toBe(targetUndefined.xyz[0]);
    expect(undefinedResult.xyz[1]).toBe(targetUndefined.xyz[1]); // Both should be undefined
    expect(undefinedResult.xyz[2]).toBe(targetUndefined.xyz[2]);
  });
});