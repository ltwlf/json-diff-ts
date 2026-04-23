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

**Deterministic JSON state transitions with key-based array identity.** A TypeScript JSON diff library that computes, applies, and reverts atomic changes using the [JSON Atom](https://github.com/ltwlf/json-atom-format) wire format -- a JSON Patch alternative with stable array paths, built-in undo/redo for JSON, and language-agnostic state synchronization.

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
import { diffAtom, applyAtom, revertAtom } from 'json-diff-ts';

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

const atom = diffAtom(before, after, { arrayIdentityKeys: { items: 'id' } });
```

The atom tracks _what_ changed, not _where_ it moved:

```json
{
  "format": "json-atom",
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
// Clone before applying — applyAtom mutates the input object
const updated  = applyAtom(structuredClone(before), atom);  // updated === after
const restored = revertAtom(structuredClone(updated), atom); // restored === before
```

## Quick Start

```typescript
import { diffAtom, applyAtom, revertAtom } from 'json-diff-ts';

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

// 1. Compute an atom between two JSON objects
const atom = diffAtom(oldObj, newObj, {
  arrayIdentityKeys: { items: 'id' },   // match array elements by 'id' field
});
// atom.operations =>
// [
//   { op: 'replace', path: '$.items[?(@.id==1)].name', value: 'Widget Pro', oldValue: 'Widget' },
//   { op: 'add', path: '$.items[?(@.id==3)]', value: { id: 3, name: 'Doohickey', price: 4.99 } }
// ]

// 2. Apply the atom to produce the new state
const updated = applyAtom(structuredClone(oldObj), atom);

// 3. Revert the atom to restore the original state
const reverted = revertAtom(structuredClone(updated), atom);
```

That's it. `atom` is a plain JSON object you can store in a database, send over HTTP, or consume in any language.

## Installation

```sh
npm install json-diff-ts
```

```typescript
// ESM / TypeScript
import { diffAtom, applyAtom, revertAtom } from 'json-diff-ts';

// CommonJS
const { diffAtom, applyAtom, revertAtom } = require('json-diff-ts');
```

## What is JSON Atom?

[JSON Atom](https://github.com/ltwlf/json-atom-format) is a specification for representing atomic changes to JSON documents. json-diff-ts is the originating implementation from which the spec was derived.

```text
json-atom-format  (specification)
    ├── json-diff-ts      (TypeScript implementation)  ← this package
    └── json-atom-py     (Python implementation)
```

The specification defines the wire format. Each language implementation produces and consumes compatible atoms.

An atom is a self-describing JSON document you can store, transmit, and consume in any language:

- **Three operations** -- `add`, `remove`, `replace`. Nothing else to learn.
- **JSONPath-based paths** -- `$.items[?(@.id==1)].name` identifies elements by key, not index.
- **Reversible by default** -- every `replace` and `remove` includes `oldValue` for undo.
- **Self-identifying** -- the `format` field makes atoms discoverable without external context.
- **Extension-friendly** -- unknown properties are preserved; `x_`-prefixed properties are future-safe.

### JSON Atom vs JSON Patch (RFC 6902)

JSON Patch uses JSON Pointer paths like `/items/0` that reference array elements by index. When an element is inserted at position 0, every subsequent path shifts -- `/items/1` now points to what was `/items/0`. This makes stored patches unreliable for JSON change tracking, audit logs, or undo/redo across time.

JSON Atom uses JSONPath filter expressions like `$.items[?(@.id==1)]` that identify elements by a stable key. The path stays valid regardless of insertions, deletions, or reordering.

| | JSON Atom | JSON Patch (RFC 6902) |
| --- | --- | --- |
| Path syntax | JSONPath (`$.items[?(@.id==1)]`) | JSON Pointer (`/items/0`) |
| Array identity | Key-based -- survives reorder | Index-based -- breaks on insert/delete |
| Reversibility | Built-in `oldValue` | Not supported |
| Self-describing | `format` field in envelope | No envelope |
| Specification | [json-atom-format](https://github.com/ltwlf/json-atom-format) | [RFC 6902](https://tools.ietf.org/html/rfc6902) |

---

## JSON Atom API

### `diffAtom` -- Compute an Atom

```typescript
const atom = diffAtom(
  { user: { name: 'Alice', role: 'viewer' } },
  { user: { name: 'Alice', role: 'admin' } }
);
// atom.operations → [{ op: 'replace', path: '$.user.role', value: 'admin', oldValue: 'viewer' }]
```

#### Keyed Arrays

Match array elements by identity key. Filter paths use canonical typed literals per the spec:

```typescript
const atom = diffAtom(
  { users: [{ id: 1, role: 'viewer' }, { id: 2, role: 'editor' }] },
  { users: [{ id: 1, role: 'admin' },  { id: 2, role: 'editor' }] },
  { arrayIdentityKeys: { users: 'id' } }
);
// atom.operations → [{ op: 'replace', path: '$.users[?(@.id==1)].role', value: 'admin', oldValue: 'viewer' }]
```

#### Non-reversible Mode

Omit `oldValue` fields when you don't need undo:

```typescript
const atom = diffAtom(source, target, { reversible: false });
```

### `applyAtom` -- Apply an Atom

Applies operations sequentially. Always use the return value (required for root-level replacements):

```typescript
const result = applyAtom(structuredClone(source), atom);
```

### `revertAtom` -- Revert an Atom

Computes the inverse and applies it. Requires `oldValue` on all `replace` and `remove` operations:

```typescript
const original = revertAtom(structuredClone(target), atom);
```

### `invertAtom` -- Compute the Inverse

Returns a new atom that undoes the original (spec Section 9.2):

```typescript
const inverse = invertAtom(atom);
// add ↔ remove, replace swaps value/oldValue, order reversed
```

### `validateAtom` -- Validate Structure

```typescript
const { valid, errors } = validateAtom(maybeAtom);
```

### API Reference

| Function | Signature | Description |
| --- | --- | --- |
| `diffAtom` | `(oldObj, newObj, options?) => IJsonAtom` | Compute a canonical JSON Atom |
| `applyAtom` | `(obj, atom) => any` | Apply an atom sequentially. Returns the result |
| `revertAtom` | `(obj, atom) => any` | Revert a reversible atom |
| `invertAtom` | `(atom) => IJsonAtom` | Compute the inverse atom |
| `validateAtom` | `(atom) => { valid, errors }` | Structural validation |
| `toAtom` | `(changeset, options?) => IJsonAtom` | Bridge: v4 changeset to JSON Atom |
| `fromAtom` | `(atom) => IAtomicChange[]` | Bridge: JSON Atom to v4 atomic changes |
| `squashAtoms` | `(source, atoms, options?) => IJsonAtom` | Compact multiple atoms into one net-effect atom |
| `atomMap` | `(atom, fn) => IJsonAtom` | Transform each operation in an atom |
| `atomStamp` | `(atom, extensions) => IJsonAtom` | Set extension properties on all operations |
| `atomGroupBy` | `(atom, keyFn) => Record<string, IJsonAtom>` | Group operations into sub-atoms |
| `operationSpecDict` | `(op) => IAtomOperation` | Strip extension properties from operation |
| `operationExtensions` | `(op) => Record<string, any>` | Get extension properties from operation |
| `atomSpecDict` | `(atom) => IJsonAtom` | Strip all extensions from atom |
| `atomExtensions` | `(atom) => Record<string, any>` | Get envelope extensions from atom |
| `leafProperty` | `(op) => string \| null` | Terminal property name from operation path |

### AtomOptions

Extends the base `Options` interface:

```typescript
interface AtomOptions extends Options {
  reversible?: boolean;       // Include oldValue for undo. Default: true
  arrayIdentityKeys?: Record<string, string | FunctionKey>;
  keysToSkip?: readonly (string | RegExp)[];
}
```

### Atom Workflow Helpers

Transform, inspect, and compact atoms for workflow automation.

#### `squashAtoms` -- Compact Multiple Atoms

Combine a sequence of atoms into a single net-effect atom. Useful for compacting audit logs or collapsing undo history:

```typescript
import { diffAtom, applyAtom, squashAtoms } from 'json-diff-ts';

const source = { name: 'Alice', role: 'viewer' };
const d1 = diffAtom(source, { name: 'Bob', role: 'viewer' });
const d2 = diffAtom({ name: 'Bob', role: 'viewer' }, { name: 'Bob', role: 'admin' });

const squashed = squashAtoms(source, [d1, d2]);
// squashed.operations => [
//   { op: 'replace', path: '$.name', value: 'Bob', oldValue: 'Alice' },
//   { op: 'replace', path: '$.role', value: 'admin', oldValue: 'viewer' }
// ]

// Verify: applying the squashed atom equals applying both sequentially
const result = applyAtom(structuredClone(source), squashed);
// result => { name: 'Bob', role: 'admin' }
```

Options: `reversible`, `arrayIdentityKeys`, `target` (pre-computed final state), `verifyTarget` (default: true).

#### `atomMap` / `atomStamp` / `atomGroupBy` -- Atom Transformations

All transforms are immutable — they return new atoms without modifying the original:

```typescript
import { diffAtom, atomMap, atomStamp, atomGroupBy } from 'json-diff-ts';

const atom = diffAtom(
  { name: 'Alice', age: 30, role: 'viewer' },
  { name: 'Bob', age: 31, status: 'active' }
);

// Stamp metadata onto every operation
const stamped = atomStamp(atom, { x_author: 'system', x_ts: Date.now() });

// Transform operations
const prefixed = atomMap(atom, (op) => ({
  ...op,
  path: op.path.replace('$', '$.data'),
}));

// Group by operation type
const groups = atomGroupBy(atom, (op) => op.op);
// groups => { replace: IJsonAtom, add: IJsonAtom, remove: IJsonAtom }
```

#### `operationSpecDict` / `atomSpecDict` -- Spec Introspection

Separate spec-defined fields from extension properties:

```typescript
import { operationSpecDict, operationExtensions, atomSpecDict } from 'json-diff-ts';

const op = { op: 'replace', path: '$.name', value: 'Bob', x_author: 'system' };
operationSpecDict(op);    // { op: 'replace', path: '$.name', value: 'Bob' }
operationExtensions(op);  // { x_author: 'system' }

// Strip all extensions from an atom
const clean = atomSpecDict(atom);
```

#### `leafProperty` -- Path Introspection

Extract the terminal property name from an operation's path:

```typescript
import { leafProperty } from 'json-diff-ts';

leafProperty({ op: 'replace', path: '$.user.name' });          // 'name'
leafProperty({ op: 'add', path: '$.items[?(@.id==1)]' });      // null (filter)
leafProperty({ op: 'replace', path: '$' });                     // null (root)
```

---

## Comparison Serialization

Serialize enriched comparison trees to plain objects or flat change lists.

```typescript
import { compare, comparisonToDict, comparisonToFlatList } from 'json-diff-ts';

const result = compare(
  { name: 'Alice', age: 30, role: 'viewer' },
  { name: 'Bob', age: 30, status: 'active' }
);

// Recursive plain object
const dict = comparisonToDict(result);
// {
//   type: 'CONTAINER',
//   value: {
//     name: { type: 'UPDATE', value: 'Bob', oldValue: 'Alice' },
//     age: { type: 'UNCHANGED', value: 30 },
//     role: { type: 'REMOVE', oldValue: 'viewer' },
//     status: { type: 'ADD', value: 'active' }
//   }
// }

// Flat list of leaf changes with paths
const flat = comparisonToFlatList(result);
// [
//   { path: '$.name', type: 'UPDATE', value: 'Bob', oldValue: 'Alice' },
//   { path: '$.role', type: 'REMOVE', oldValue: 'viewer' },
//   { path: '$.status', type: 'ADD', value: 'active' }
// ]

// Include unchanged entries
const all = comparisonToFlatList(result, { includeUnchanged: true });
```

---

## Practical Examples

### Audit Log

Store every change to a document as a reversible atom. Each entry records who changed what, when, and can be replayed or reverted independently -- a complete JSON change tracking system:

```typescript
import { diffAtom, applyAtom, revertAtom, IJsonAtom } from 'json-diff-ts';

interface AuditEntry {
  timestamp: string;
  userId: string;
  atom: IJsonAtom;
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
  const atom = diffAtom(doc, newDoc, {
    arrayIdentityKeys: { items: 'id' },
  });

  if (atom.operations.length > 0) {
    auditLog.push({ timestamp: new Date().toISOString(), userId, atom });
    doc = applyAtom(structuredClone(doc), atom);
  }

  return doc;
}

// Revert the last change
function undo(): typeof doc {
  const last = auditLog.pop();
  if (!last) return doc;
  doc = revertAtom(structuredClone(doc), last.atom);
  return doc;
}

// Example usage:
updateDocument(
  { ...doc, status: 'active', items: [{ id: 1, task: 'Design', done: true }, ...doc.items.slice(1)] },
  'alice'
);
// auditLog[0].atom.operations =>
// [
//   { op: 'replace', path: '$.status', value: 'active', oldValue: 'draft' },
//   { op: 'replace', path: '$.items[?(@.id==1)].done', value: true, oldValue: false }
// ]
```

Because every atom is self-describing JSON, your audit log is queryable, storable in any database, and readable from any language.

### Undo / Redo Stack

Build undo/redo for any JSON state object. Atoms are small (only changed fields), reversible, and serializable:

```typescript
import { diffAtom, applyAtom, revertAtom, IJsonAtom } from 'json-diff-ts';

class UndoManager<T extends object> {
  private undoStack: IJsonAtom[] = [];
  private redoStack: IJsonAtom[] = [];

  constructor(private state: T) {}

  apply(newState: T): T {
    const atom = diffAtom(this.state, newState);
    if (atom.operations.length === 0) return this.state;
    this.undoStack.push(atom);
    this.redoStack = [];
    this.state = applyAtom(structuredClone(this.state), atom);
    return this.state;
  }

  undo(): T {
    const atom = this.undoStack.pop();
    if (!atom) return this.state;
    this.redoStack.push(atom);
    this.state = revertAtom(structuredClone(this.state), atom);
    return this.state;
  }

  redo(): T {
    const atom = this.redoStack.pop();
    if (!atom) return this.state;
    this.undoStack.push(atom);
    this.state = applyAtom(structuredClone(this.state), atom);
    return this.state;
  }
}
```

### Data Synchronization

Send only what changed between client and server. Atoms are compact -- a single field change in a 10KB document produces a few bytes of atom, making state synchronization efficient over the wire:

```typescript
import { diffAtom, applyAtom, validateAtom } from 'json-diff-ts';

// Client side: compute and send atom
const atom = diffAtom(localState, updatedState, {
  arrayIdentityKeys: { records: 'id' },
});
await fetch('/api/sync', {
  method: 'POST',
  body: JSON.stringify(atom),
});

// Server side: validate and apply
const result = validateAtom(req.body);
if (!result.valid) return res.status(400).json(result.errors);
// ⚠️ In production, sanitize paths/values to prevent prototype pollution
//    (e.g. reject paths containing "__proto__" or "constructor")
currentState = applyAtom(structuredClone(currentState), req.body);
```

---

## Bridge: v4 Changeset <-> JSON Atom

Convert between the legacy internal format and JSON Atom:

```typescript
import { diff, toAtom, fromAtom, unatomizeChangeset } from 'json-diff-ts';

// v4 changeset → JSON Atom
const changeset = diff(source, target, { arrayIdentityKeys: { items: 'id' } });
const atom = toAtom(changeset);

// JSON Atom → v4 atomic changes
const atoms = fromAtom(atom);

// v4 atomic changes → hierarchical changeset (if needed)
const cs = unatomizeChangeset(atoms);
```

**Note:** `toAtom` is a best-effort bridge. Filter literals are always string-quoted (e.g., `[?(@.id=='42')]` instead of canonical `[?(@.id==42)]`). Use `diffAtom()` for fully canonical output.

---

## Legacy Changeset API (v4 Compatibility)

All v4 APIs remain fully supported. Existing code continues to work without changes. For new projects, prefer the JSON Atom API above.

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
// Skip an exact path and all its children
diff(old, new, { keysToSkip: ['characters.metadata'] });

// Skip all children of a path using a regex but still detect ADD/REMOVE of the node itself
diff(old, new, { keysToSkip: [/^characters\.metadata\./] });

// Skip any path ending in a given key name, regardless of nesting depth
diff(old, new, { keysToSkip: [/\.secret$/] });

// Skip all properties except one
diff(old, new, { keysToSkip: [/^address\.(?!city$)/] });

// Mix strings and regexes in the same array
diff(old, new, { keysToSkip: ['characters.metadata', /\.secret$/] });
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
| `comparisonToDict(node)` | Serialize comparison tree to plain object |
| `comparisonToFlatList(node, options?)` | Flatten comparison to leaf change list |

### Options

```typescript
interface Options {
  arrayIdentityKeys?: Record<string, string | FunctionKey> | Map<string | RegExp, string | FunctionKey>;
  /** @deprecated Use arrayIdentityKeys instead */
  embeddedObjKeys?: Record<string, string | FunctionKey> | Map<string | RegExp, string | FunctionKey>;
  keysToSkip?: readonly (string | RegExp)[];
  treatTypeChangeAsReplace?: boolean; // default: true
}
```

---

## Migration from v4

1. **No action required** -- all v4 APIs work identically in v5.
2. **Adopt JSON Atom** -- use `diffAtom()` / `applyAtom()` for new code.
3. **Bridge existing data** -- `toAtom()` / `fromAtom()` for interop with stored v4 changesets.
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
| Wire Format | JSON Atom (standardized) | Proprietary | Proprietary | JSON Pointer |
| Reversibility | Built-in (`oldValue`) | Manual | Plugin | Not built-in |

## FAQ

**Q: How does JSON Atom compare to JSON Patch (RFC 6902)?**
JSON Patch uses JSON Pointer (`/items/0`) for paths, which breaks when array elements are inserted, deleted, or reordered. JSON Atom uses JSONPath filter expressions (`$.items[?(@.id==1)]`) for stable, key-based identity. JSON Atom also supports built-in reversibility via `oldValue`.

**Q: Can I use this with React / Vue / Angular?**
Yes. json-diff-ts works in any JavaScript runtime -- browsers, Node.js, Deno, Bun, edge workers.

**Q: Is it suitable for large objects?**
Yes. The library handles large, deeply nested JSON structures efficiently with zero dependencies and a ~6KB gzipped footprint.

**Q: Can I use the v4 API alongside JSON Atom?**
Yes. Both APIs coexist. Use `toAtom()` / `fromAtom()` to convert between formats.

**Q: What about arrays of primitives?**
Use `$value` as the identity key: `{ arrayIdentityKeys: { tags: '$value' } }`. Elements are matched by value identity.

---

## Release Notes

- **v5.0.0-alpha.2:**
  - Atom workflow helpers: `squashAtoms`, `atomMap`, `atomStamp`, `atomGroupBy`
  - Atom/operation introspection: `operationSpecDict`, `operationExtensions`, `atomSpecDict`, `atomExtensions`, `leafProperty`
  - Comparison serialization: `comparisonToDict`, `comparisonToFlatList`

- **v5.0.0-alpha.0:**
  - JSON Atom API: `diffAtom`, `applyAtom`, `revertAtom`, `invertAtom`, `toAtom`, `fromAtom`, `validateAtom`
  - Canonical path production with typed filter literals
  - Conformance with the [JSON Atom Specification](https://github.com/ltwlf/json-atom-format) v0
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
