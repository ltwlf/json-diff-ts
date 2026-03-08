# json-diff-ts

[![CI](https://github.com/ltwlf/json-diff-ts/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/ltwlf/json-diff-ts/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/ltwlf/json-diff-ts/branch/master/graph/badge.svg)](https://codecov.io/gh/ltwlf/json-diff-ts)
[![npm version](https://badge.fury.io/js/json-diff-ts.svg)](https://badge.fury.io/js/json-diff-ts)
[![npm downloads](https://img.shields.io/npm/dm/json-diff-ts.svg)](https://www.npmjs.com/package/json-diff-ts)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/json-diff-ts)](https://bundlephobia.com/package/json-diff-ts)
[![Known Vulnerabilities](https://snyk.io/test/github/ltwlf/json-diff-ts/badge.svg?targetFile=package.json)](https://snyk.io/test/github/ltwlf/json-diff-ts?targetFile=package.json)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=ltwlf_json-diff-ts&metric=alert_status)](https://sonarcloud.io/dashboard?id=ltwlf_json-diff-ts)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow.svg?logo=buy-me-a-coffee)](https://buymeacoffee.com/leitwolf)

**Deterministic JSON state transitions with key-based array identity.** A TypeScript JSON diff library that computes, applies, and reverts atomic changes using the [JSON Delta](https://github.com/ltwlf/json-delta-format) wire format -- a JSON Patch alternative with stable array paths, built-in undo/redo for JSON, and language-agnostic state synchronization.

Zero dependencies. TypeScript-first. ESM + CommonJS. Trusted by thousands of developers ([500K+ weekly npm downloads](https://www.npmjs.com/package/json-diff-ts)).

## Why Index-Based Diffing Breaks

Most JSON diff libraries track array changes by position. Insert one element at the start and every path shifts:

```text
Remove /items/0  ← was actually "Widget"
Add    /items/0  ← now it's "NewItem"
Update /items/1  ← this used to be /items/0
...
```

This makes diffs fragile -- you can't store them, replay them reliably, or build audit logs on top of them. Reorder the array and every operation is wrong. This is the fundamental problem with index-based formats like JSON Patch (RFC 6902): paths like `/items/0` are positional, so any insertion, deletion, or reorder invalidates every subsequent path.

**json-diff-ts solves this with key-based identity.** Array elements are matched by a stable key (`id`, `sku`, or any field), and paths use JSONPath filter expressions that survive insertions, deletions, and reordering:

```typescript
import { diffDelta, applyDelta, revertDelta } from 'json-diff-ts';

const before = {
  items: [
    { id: 1, name: 'Widget', price: 9.99 },
    { id: 2, name: 'Gadget', price: 24.99 },
  ],
};

const after = {
  items: [
    { id: 2, name: 'Gadget', price: 24.99 },           // reordered
    { id: 1, name: 'Widget Pro', price: 14.99 },        // renamed + repriced
    { id: 3, name: 'Doohickey', price: 4.99 },          // added
  ],
};

const delta = diffDelta(before, after, { arrayIdentityKeys: { items: 'id' } });
```

The delta tracks _what_ changed, not _where_ it moved:

```json
{
  "format": "json-delta",
  "version": 1,
  "operations": [
    { "op": "replace", "path": "$.items[?(@.id==1)].name", "value": "Widget Pro", "oldValue": "Widget" },
    { "op": "replace", "path": "$.items[?(@.id==1)].price", "value": 14.99, "oldValue": 9.99 },
    { "op": "add", "path": "$.items[?(@.id==3)]", "value": { "id": 3, "name": "Doohickey", "price": 4.99 } }
  ]
}
```

Apply forward to get the new state, or revert to restore the original:

```typescript
// Clone before applying — applyDelta mutates the input object
const updated  = applyDelta(structuredClone(before), delta);  // updated === after
const restored = revertDelta(structuredClone(updated), delta); // restored === before
```

## Quick Start

```typescript
import { diffDelta, applyDelta, revertDelta } from 'json-diff-ts';

const oldObj = {
  items: [
    { id: 1, name: 'Widget', price: 9.99 },
    { id: 2, name: 'Gadget', price: 24.99 },
  ],
};

const newObj = {
  items: [
    { id: 1, name: 'Widget Pro', price: 9.99 },
    { id: 2, name: 'Gadget', price: 24.99 },
    { id: 3, name: 'Doohickey', price: 4.99 },
  ],
};

// 1. Compute a delta between two JSON objects
const delta = diffDelta(oldObj, newObj, {
  arrayIdentityKeys: { items: 'id' },   // match array elements by 'id' field
});
// delta.operations =>
// [
//   { op: 'replace', path: '$.items[?(@.id==1)].name', value: 'Widget Pro', oldValue: 'Widget' },
//   { op: 'add', path: '$.items[?(@.id==3)]', value: { id: 3, name: 'Doohickey', price: 4.99 } }
// ]

// 2. Apply the delta to produce the new state
const updated = applyDelta(structuredClone(oldObj), delta);

// 3. Revert the delta to restore the original state
const reverted = revertDelta(structuredClone(updated), delta);
```

That's it. `delta` is a plain JSON object you can store in a database, send over HTTP, or consume in any language.

## Installation

```sh
npm install json-diff-ts
```

```typescript
// ESM / TypeScript
import { diffDelta, applyDelta, revertDelta } from 'json-diff-ts';

// CommonJS
const { diffDelta, applyDelta, revertDelta } = require('json-diff-ts');
```

## What is JSON Delta?

[JSON Delta](https://github.com/ltwlf/json-delta-format) is a specification for representing atomic changes to JSON documents. json-diff-ts is the originating implementation from which the spec was derived.

A delta is a self-describing JSON document you can store, transmit, and consume in any language:

- **Three operations** -- `add`, `remove`, `replace`. Nothing else to learn.
- **JSONPath-based paths** -- `$.items[?(@.id==1)].name` identifies elements by key, not index.
- **Reversible by default** -- every `replace` and `remove` includes `oldValue` for undo.
- **Self-identifying** -- the `format` field makes deltas discoverable without external context.
- **Extension-friendly** -- unknown properties are preserved; `x_`-prefixed properties are future-safe.

### JSON Delta vs JSON Patch (RFC 6902)

JSON Patch uses JSON Pointer paths like `/items/0` that reference array elements by index. When an element is inserted at position 0, every subsequent path shifts -- `/items/1` now points to what was `/items/0`. This makes stored patches unreliable for JSON change tracking, audit logs, or undo/redo across time.

JSON Delta uses JSONPath filter expressions like `$.items[?(@.id==1)]` that identify elements by a stable key. The path stays valid regardless of insertions, deletions, or reordering.

| | JSON Delta | JSON Patch (RFC 6902) |
| --- | --- | --- |
| Path syntax | JSONPath (`$.items[?(@.id==1)]`) | JSON Pointer (`/items/0`) |
| Array identity | Key-based -- survives reorder | Index-based -- breaks on insert/delete |
| Reversibility | Built-in `oldValue` | Not supported |
| Self-describing | `format` field in envelope | No envelope |
| Specification | [json-delta-format](https://github.com/ltwlf/json-delta-format) | [RFC 6902](https://tools.ietf.org/html/rfc6902) |

---

## JSON Delta API

### `diffDelta` -- Compute a Delta

```typescript
const delta = diffDelta(
  { user: { name: 'Alice', role: 'viewer' } },
  { user: { name: 'Alice', role: 'admin' } }
);
// delta.operations → [{ op: 'replace', path: '$.user.role', value: 'admin', oldValue: 'viewer' }]
```

#### Keyed Arrays

Match array elements by identity key. Filter paths use canonical typed literals per the spec:

```typescript
const delta = diffDelta(
  { users: [{ id: 1, role: 'viewer' }, { id: 2, role: 'editor' }] },
  { users: [{ id: 1, role: 'admin' },  { id: 2, role: 'editor' }] },
  { arrayIdentityKeys: { users: 'id' } }
);
// delta.operations → [{ op: 'replace', path: '$.users[?(@.id==1)].role', value: 'admin', oldValue: 'viewer' }]
```

#### Non-reversible Mode

Omit `oldValue` fields when you don't need undo:

```typescript
const delta = diffDelta(source, target, { reversible: false });
```

### `applyDelta` -- Apply a Delta

Applies operations sequentially. Always use the return value (required for root-level replacements):

```typescript
const result = applyDelta(structuredClone(source), delta);
```

### `revertDelta` -- Revert a Delta

Computes the inverse and applies it. Requires `oldValue` on all `replace` and `remove` operations:

```typescript
const original = revertDelta(structuredClone(target), delta);
```

### `invertDelta` -- Compute the Inverse

Returns a new delta that undoes the original (spec Section 9.2):

```typescript
const inverse = invertDelta(delta);
// add ↔ remove, replace swaps value/oldValue, order reversed
```

### `validateDelta` -- Validate Structure

```typescript
const { valid, errors } = validateDelta(maybeDelta);
```

### API Reference

| Function | Signature | Description |
| --- | --- | --- |
| `diffDelta` | `(oldObj, newObj, options?) => IJsonDelta` | Compute a canonical JSON Delta |
| `applyDelta` | `(obj, delta) => any` | Apply a delta sequentially. Returns the result |
| `revertDelta` | `(obj, delta) => any` | Revert a reversible delta |
| `invertDelta` | `(delta) => IJsonDelta` | Compute the inverse delta |
| `validateDelta` | `(delta) => { valid, errors }` | Structural validation |
| `toDelta` | `(changeset, options?) => IJsonDelta` | Bridge: v4 changeset to JSON Delta |
| `fromDelta` | `(delta) => IAtomicChange[]` | Bridge: JSON Delta to v4 atomic changes |

### DeltaOptions

Extends the base `Options` interface:

```typescript
interface DeltaOptions extends Options {
  reversible?: boolean;       // Include oldValue for undo. Default: true
  arrayIdentityKeys?: Record<string, string | FunctionKey>;
  keysToSkip?: readonly string[];
}
```

---

## Practical Examples

### Audit Log

Store every change to a document as a reversible delta. Each entry records who changed what, when, and can be replayed or reverted independently -- a complete JSON change tracking system:

```typescript
import { diffDelta, applyDelta, revertDelta, IJsonDelta } from 'json-diff-ts';

interface AuditEntry {
  timestamp: string;
  userId: string;
  delta: IJsonDelta;
}

const auditLog: AuditEntry[] = [];
let doc = {
  title: 'Project Plan',
  status: 'draft',
  items: [
    { id: 1, task: 'Design', done: false },
    { id: 2, task: 'Build', done: false },
  ],
};

function updateDocument(newDoc: typeof doc, userId: string) {
  const delta = diffDelta(doc, newDoc, {
    arrayIdentityKeys: { items: 'id' },
  });

  if (delta.operations.length > 0) {
    auditLog.push({ timestamp: new Date().toISOString(), userId, delta });
    doc = applyDelta(structuredClone(doc), delta);
  }

  return doc;
}

// Revert the last change
function undo(): typeof doc {
  const last = auditLog.pop();
  if (!last) return doc;
  doc = revertDelta(structuredClone(doc), last.delta);
  return doc;
}

// Example usage:
updateDocument(
  { ...doc, status: 'active', items: [{ id: 1, task: 'Design', done: true }, ...doc.items.slice(1)] },
  'alice'
);
// auditLog[0].delta.operations =>
// [
//   { op: 'replace', path: '$.status', value: 'active', oldValue: 'draft' },
//   { op: 'replace', path: '$.items[?(@.id==1)].done', value: true, oldValue: false }
// ]
```

Because every delta is self-describing JSON, your audit log is queryable, storable in any database, and readable from any language.

### Undo / Redo Stack

Build undo/redo for any JSON state object. Deltas are small (only changed fields), reversible, and serializable:

```typescript
import { diffDelta, applyDelta, revertDelta, IJsonDelta } from 'json-diff-ts';

class UndoManager<T extends object> {
  private undoStack: IJsonDelta[] = [];
  private redoStack: IJsonDelta[] = [];

  constructor(private state: T) {}

  apply(newState: T): T {
    const delta = diffDelta(this.state, newState);
    if (delta.operations.length === 0) return this.state;
    this.undoStack.push(delta);
    this.redoStack = [];
    this.state = applyDelta(structuredClone(this.state), delta);
    return this.state;
  }

  undo(): T {
    const delta = this.undoStack.pop();
    if (!delta) return this.state;
    this.redoStack.push(delta);
    this.state = revertDelta(structuredClone(this.state), delta);
    return this.state;
  }

  redo(): T {
    const delta = this.redoStack.pop();
    if (!delta) return this.state;
    this.undoStack.push(delta);
    this.state = applyDelta(structuredClone(this.state), delta);
    return this.state;
  }
}
```

### Data Synchronization

Send only what changed between client and server. Deltas are compact -- a single field change in a 10KB document produces a few bytes of delta, making state synchronization efficient over the wire:

```typescript
import { diffDelta, applyDelta, validateDelta } from 'json-diff-ts';

// Client side: compute and send delta
const delta = diffDelta(localState, updatedState, {
  arrayIdentityKeys: { records: 'id' },
});
await fetch('/api/sync', {
  method: 'POST',
  body: JSON.stringify(delta),
});

// Server side: validate and apply
const result = validateDelta(req.body);
if (!result.valid) return res.status(400).json(result.errors);
// ⚠️ In production, sanitize paths/values to prevent prototype pollution
//    (e.g. reject paths containing "__proto__" or "constructor")
currentState = applyDelta(structuredClone(currentState), req.body);
```

---

## Bridge: v4 Changeset <-> JSON Delta

Convert between the legacy internal format and JSON Delta:

```typescript
import { diff, toDelta, fromDelta, unatomizeChangeset } from 'json-diff-ts';

// v4 changeset → JSON Delta
const changeset = diff(source, target, { arrayIdentityKeys: { items: 'id' } });
const delta = toDelta(changeset);

// JSON Delta → v4 atomic changes
const atoms = fromDelta(delta);

// v4 atomic changes → hierarchical changeset (if needed)
const cs = unatomizeChangeset(atoms);
```

**Note:** `toDelta` is a best-effort bridge. Filter literals are always string-quoted (e.g., `[?(@.id=='42')]` instead of canonical `[?(@.id==42)]`). Use `diffDelta()` for fully canonical output.

---

## Legacy Changeset API (v4 Compatibility)

All v4 APIs remain fully supported. Existing code continues to work without changes. For new projects, prefer the JSON Delta API above.

### `diff`

Generates a hierarchical changeset between two objects:

```typescript
import { diff } from 'json-diff-ts';

const oldData = {
  location: 'Tatooine',
  characters: [
    { id: 'LUKE', name: 'Luke Skywalker', role: 'Farm Boy' },
    { id: 'LEIA', name: 'Princess Leia', role: 'Prisoner' }
  ],
};

const newData = {
  location: 'Yavin Base',
  characters: [
    { id: 'LUKE', name: 'Luke Skywalker', role: 'Pilot', rank: 'Commander' },
    { id: 'HAN', name: 'Han Solo', role: 'Smuggler' }
  ],
};

const changes = diff(oldData, newData, { arrayIdentityKeys: { characters: 'id' } });
```

### `applyChangeset` and `revertChangeset`

```typescript
import { applyChangeset, revertChangeset } from 'json-diff-ts';

const updated = applyChangeset(structuredClone(oldData), changes);
const reverted = revertChangeset(structuredClone(newData), changes);
```

### `atomizeChangeset` and `unatomizeChangeset`

Flatten a hierarchical changeset into atomic changes addressable by JSONPath, or reconstruct the hierarchy:

```typescript
import { atomizeChangeset, unatomizeChangeset } from 'json-diff-ts';

const atoms = atomizeChangeset(changes);
// [
//   { type: 'UPDATE', key: 'location', value: 'Yavin Base', oldValue: 'Tatooine',
//     path: '$.location', valueType: 'String' },
//   { type: 'ADD', key: 'rank', value: 'Commander',
//     path: "$.characters[?(@.id=='LUKE')].rank", valueType: 'String' },
//   ...
// ]

const restored = unatomizeChangeset(atoms.slice(0, 2));
```

### Advanced Options

#### Key-based Array Matching

```typescript
// Named key
diff(old, new, { arrayIdentityKeys: { characters: 'id' } });

// Function key
diff(old, new, {
  arrayIdentityKeys: {
    characters: (obj, shouldReturnKeyName) => (shouldReturnKeyName ? 'id' : obj.id)
  }
});

// Regex path matching
const keys = new Map();
keys.set(/^characters/, 'id');
diff(old, new, { arrayIdentityKeys: keys });

// Value-based identity for primitive arrays
diff(old, new, { arrayIdentityKeys: { tags: '$value' } });
```

#### Path Skipping

```typescript
diff(old, new, { keysToSkip: ['characters.metadata'] });
```

#### Type Change Handling

```typescript
diff(old, new, { treatTypeChangeAsReplace: false });
```

### Legacy API Reference

| Function | Description |
| --- | --- |
| `diff(oldObj, newObj, options?)` | Compute hierarchical changeset |
| `applyChangeset(obj, changeset)` | Apply a changeset to an object |
| `revertChangeset(obj, changeset)` | Revert a changeset from an object |
| `atomizeChangeset(changeset)` | Flatten to atomic changes with JSONPath |
| `unatomizeChangeset(atoms)` | Reconstruct hierarchy from atomic changes |

### Comparison Functions

| Function | Description |
| --- | --- |
| `compare(oldObj, newObj)` | Create enriched comparison object |
| `enrich(obj)` | Create enriched representation |

### Options

```typescript
interface Options {
  arrayIdentityKeys?: Record<string, string | FunctionKey> | Map<string | RegExp, string | FunctionKey>;
  /** @deprecated Use arrayIdentityKeys instead */
  embeddedObjKeys?: Record<string, string | FunctionKey> | Map<string | RegExp, string | FunctionKey>;
  keysToSkip?: readonly string[];
  treatTypeChangeAsReplace?: boolean; // default: true
}
```

---

## Migration from v4

1. **No action required** -- all v4 APIs work identically in v5.
2. **Adopt JSON Delta** -- use `diffDelta()` / `applyDelta()` for new code.
3. **Bridge existing data** -- `toDelta()` / `fromDelta()` for interop with stored v4 changesets.
4. **Rename `embeddedObjKeys` to `arrayIdentityKeys`** -- the old name still works, but `arrayIdentityKeys` is the preferred name going forward.
5. Both formats coexist. No forced migration.

---

## Why json-diff-ts?

| Feature | json-diff-ts | deep-diff | jsondiffpatch | RFC 6902 |
| --- | --- | --- | --- | --- |
| TypeScript | Native | Partial | Definitions only | Varies |
| Bundle Size | ~21KB | ~45KB | ~120KB+ | Varies |
| Dependencies | Zero | Few | Many | Varies |
| ESM Support | Native | CJS only | CJS only | Varies |
| Array Identity | Key-based | Index only | Configurable | Index only |
| Wire Format | JSON Delta (standardized) | Proprietary | Proprietary | JSON Pointer |
| Reversibility | Built-in (`oldValue`) | Manual | Plugin | Not built-in |

## FAQ

**Q: How does JSON Delta compare to JSON Patch (RFC 6902)?**
JSON Patch uses JSON Pointer (`/items/0`) for paths, which breaks when array elements are inserted, deleted, or reordered. JSON Delta uses JSONPath filter expressions (`$.items[?(@.id==1)]`) for stable, key-based identity. JSON Delta also supports built-in reversibility via `oldValue`.

**Q: Can I use this with React / Vue / Angular?**
Yes. json-diff-ts works in any JavaScript runtime -- browsers, Node.js, Deno, Bun, edge workers.

**Q: Is it suitable for large objects?**
Yes. The library handles large, deeply nested JSON structures efficiently with zero dependencies and a ~6KB gzipped footprint.

**Q: Can I use the v4 API alongside JSON Delta?**
Yes. Both APIs coexist. Use `toDelta()` / `fromDelta()` to convert between formats.

**Q: What about arrays of primitives?**
Use `$value` as the identity key: `{ arrayIdentityKeys: { tags: '$value' } }`. Elements are matched by value identity.

---

## Release Notes

- **v5.0.0-alpha.0:**
  - JSON Delta API: `diffDelta`, `applyDelta`, `revertDelta`, `invertDelta`, `toDelta`, `fromDelta`, `validateDelta`
  - Canonical path production with typed filter literals
  - Conformance with the [JSON Delta Specification](https://github.com/ltwlf/json-delta-format) v0
  - Renamed `embeddedObjKeys` to `arrayIdentityKeys` (old name still works as deprecated alias)
  - All v4 APIs preserved unchanged

- **v4.9.0:**
  - Fixed `applyChangeset` and `revertChangeset` for root-level arrays containing objects (fixes #362)
  - Fixed `compare` on root-level arrays producing unexpected UNCHANGED entries (fixes #358)
  - Refactored `applyChangelist` path resolution for correctness with terminal array indices
  - `keysToSkip` now accepts `readonly string[]` (fixes #359)
  - `keyBy` callback now receives the element index (PR #365)
  - Enhanced array handling for `undefined` values (fixes #316)
  - Fixed typo in warning message (#361)
  - Fixed README Options Interface formatting (#360)
- **v4.8.2:** Fixed array handling in `applyChangeset` for null, undefined, and deleted elements (fixes issue #316)
- **v4.8.1:** Improved documentation with working examples and detailed options.
- **v4.8.0:** Significantly reduced bundle size by completely removing es-toolkit dependency and implementing custom utility functions.
- **v4.7.0:** Optimized bundle size and performance by replacing es-toolkit/compat with es-toolkit for difference, intersection, and keyBy functions
- **v4.6.3:** Fixed null comparison returning update when values are both null (fixes issue #284)
- **v4.6.2:** Fixed updating to null when `treatTypeChangeAsReplace` is false
- **v4.6.1:** Consistent JSONPath format for array items (fixes issue #269)
- **v4.6.0:** Fixed filter path regex to avoid polynomial complexity
- **v4.5.0:** Switched internal utilities from lodash to es-toolkit/compat for a smaller bundle size
- **v4.4.0:** Fixed Date-to-string diff when `treatTypeChangeAsReplace` is false
- **v4.3.0:** Added support for nested keys to skip using dotted path notation (fixes #242)
- **v4.2.0:** Improved stability with multiple fixes for atomize/unatomize, apply/revert, null handling
- **v4.1.0:** Full support for ES modules while maintaining CommonJS compatibility
- **v4.0.0:** Renamed flattenChangeset/unflattenChanges to atomizeChangeset/unatomizeChangeset; added treatTypeChangeAsReplace option

## Contributing

Contributions are welcome! Please follow the provided issue templates and code of conduct.

## Support

If you find this library useful, consider supporting its development:

[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://buymeacoffee.com/leitwolf)

## Contact

- LinkedIn: [Christian Glessner](https://www.linkedin.com/in/christian-glessner/)
- Twitter: [@leitwolf_io](https://twitter.com/leitwolf_io)

Discover more about the company behind this project: [hololux](https://hololux.com)

## Acknowledgments

This project takes inspiration and code from [diff-json](https://www.npmjs.com/package/diff-json) by viruschidai@gmail.com.

## License

json-diff-ts is open-sourced software licensed under the [MIT license](LICENSE).

The original diff-json project is also under the MIT License. For more information, refer to its [license details](https://www.npmjs.com/package/diff-json#license).
