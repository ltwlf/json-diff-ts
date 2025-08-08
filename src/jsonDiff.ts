/* Re-exports from modular files */

/* =======================
 * Re-exports
 * ======================= */

// Types
export type {
  JsonKey,
  FunctionKey,
  EmbeddedKey,
  EmbeddedObjKeysType,
  EmbeddedObjKeysMapType,
  IChange,
  Changeset,
  IAtomicChange,
  Options
} from './types.js';
export { Operation } from './types.js';

// Core diff functionality
export { diff } from './diff.js';

// Changeset operations
export { applyChangeset, revertChangeset } from './changeset.js';

// Atomization
export { atomizeChangeset, unatomizeChangeset } from './atomize.js';

// Type utility (commonly used)
export { getTypeOfObj } from './path-utils.js';