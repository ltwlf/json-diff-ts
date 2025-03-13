# Fix for atomizeChangeset with object values

## Bug
When using `atomizeChangeset` and `unatomizeChangeset` with object properties, the flattening and unflattening process didn't correctly handle the case when changing from `null` to an object value.

For example:
```typescript
const oldData = { characters: [{ id: "LUK", name: null }] };
const newData = { characters: [{ id: "LUK", name: { firstName: "Luke", lastName: "Skywalker" } }] };

const originalDiffs = diff(oldData, newData, { embeddedObjKeys: { ".characters": "id" } });
const atomizedDiffs = atomizeChangeset(originalDiffs);
const unatomizedDiffs = unatomizeChangeset(atomizedDiffs);

// Applying the original diffs would correctly update the name property
// But applying the unatomized diffs would incorrectly add the object as a new array element
```

## Fix
Modified the `atomizeChangeset` function to always append the key to the path for object values, ensuring that JSON paths consistently represent the full path to a property.

Also updated the `unatomizeChangeset` function to treat all leaf values (including objects) the same way, rather than having special handling for objects.

## Tests
Added comprehensive tests to verify:
1. Atomizing and unatomizing changes with null to object transitions works correctly
2. The resulting changes are applied correctly to the original object