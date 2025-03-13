# Fix for array handling in applyChangeset and revertChangeset

## Bug
In the functions `applyArrayChange` and `revertArrayChange`, the return value was not being used correctly. Both functions were returning an array of operation results rather than the modified array itself.

The issue didn't affect functionality because the arrays were being modified in-place by the operations, but it made the code less clear and consistent with other functions.

## Fix
Modified both `applyArrayChange` and `revertArrayChange` functions to:

1. Remove the IIFE (Immediately Invoked Function Expression) pattern
2. Directly modify the array in-place
3. Return the modified array for consistency with other functions
4. Add proper JSDoc comments to clarify the behavior

Also added support for the `$value` embeddedKey in the `revertArrayChange` function for consistency.

## Tests
Added comprehensive tests to verify that the changes work as expected, including:
1. Simple array modifications using ID as the key
2. Array modifications using the default index as the key
3. Complex nested array changes with multiple levels of nesting