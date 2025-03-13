# Fix for null value handling

## Bug
When trying to update a property from a non-null value to `null`, the applyChangeset function did not correctly apply the change. For example:

```typescript
const obj1 = { test: "foobar" };
const obj2 = { test: null };

const result = applyChangeset(obj1, diff(obj1, obj2));
// Expected: { test: null }
// Actual: { test: "foobar" } (unchanged)
```

## Fix
Updated the condition in both `applyChangeset` and `revertChangeset` functions to properly handle null values:

1. In `applyChangeset`, explicitly handle null values with ADD operations as leaf changes
2. In `revertChangeset`, explicitly handle null values with REMOVE operations as leaf changes

## Tests
Added tests to verify:
1. Correctly converting a string property to null
2. Correctly converting a null property to a string
3. Correctly reverting a null change back to its original value