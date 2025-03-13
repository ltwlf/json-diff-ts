# Fix for empty REMOVE operations when diffing from undefined

## Bug
When diffing from `undefined` to a value, the `diff` function was generating an empty REMOVE operation for the root key:

```typescript
const value = { DBA: "New Val" };
const valueDiff = diff(undefined, value);
// Results in:
// [
//   {"key": "$root", "type": "REMOVE"},                        // Empty REMOVE operation
//   {"key": "$root", "type": "ADD", "value": {"DBA": "New Val"}}
// ]
```

This empty REMOVE operation is unnecessary since there's nothing to remove when starting from `undefined`.

## Fix
Updated the condition in the `compare` function to only add a REMOVE operation if the old object is not `undefined`:

```typescript
// Only add a REMOVE operation if oldObj is not undefined
if (typeOfOldObj !== 'undefined') {
  changes.push({ type: Operation.REMOVE, key: getKey(path), value: oldObj });
}
```

## Tests
Added tests to verify:
1. When diffing from `undefined` to a value, no REMOVE operation is generated
2. When diffing from a value to `undefined`, a REMOVE operation with the original value is generated