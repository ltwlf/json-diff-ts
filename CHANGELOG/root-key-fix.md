# Fix revertChangeset for $root key operations

This patch fixes an issue where `revertChangeset` would not correctly handle changesets that used the `$root` key.

The problem occurred when trying to revert an ADD operation that had been applied to the entire object (using the `$root` key). Instead of clearing all properties from the object, the function was treating it as a regular property, which didn't have the desired effect.

The fix adds special handling for the `$root` key in the `revertLeafChange` function, with distinct behavior for each operation type:
- For ADD: Clear all properties from the object
- For UPDATE: Replace the entire object with the old value
- For REMOVE: Restore the removed object with the original value

This ensures that root-level operations are properly reversed, matching the behavior of regular property operations.
