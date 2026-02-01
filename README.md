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

## Overview

**Modern TypeScript JSON diff library** - `json-diff-ts` is a lightweight, high-performance TypeScript library for calculating and applying differences between JSON objects. Perfect for modern web applications, state management, data synchronization, and real-time collaborative editing.

### 🚀 **Why Choose json-diff-ts?**

- **🔥 Zero dependencies** - Lightweight bundle size
- **⚡ High performance** - Optimized algorithms for fast JSON diffing and patching
- **🎯 95%+ test coverage** - Thoroughly tested with comprehensive test suite
- **📦 Modern ES modules** - Full TypeScript support with tree-shaking
- **🔧 Flexible API** - Compare, diff, patch, and atomic operations
- **🌐 Universal** - Works in browsers, Node.js, and edge environments
- **✅ Production ready** - Used in enterprise applications worldwide
- **🎯 TypeScript-first** - Full type safety and IntelliSense support
- **🔧 Modern features** - ESM + CommonJS, JSONPath, atomic operations
- **📦 Production ready** - Battle-tested with comprehensive test suite

### ✨ **Key Features**

- **Key-based array identification**: Compare array elements using keys instead of indices for more intuitive diffing
- **JSONPath support**: Target specific parts of JSON documents with precision  
- **Atomic changesets**: Transform changes into granular, independently applicable operations
- **Dual module support**: Works with both ECMAScript Modules and CommonJS
- **Type change handling**: Flexible options for handling data type changes
- **Path skipping**: Skip nested paths during comparison for performance

This library is particularly valuable for applications where tracking changes in JSON data is crucial, such as state management systems, form handling, or data synchronization.

## Installation

```sh
npm install json-diff-ts
```

## Quick Start

```typescript
import { diff, applyChangeset } from 'json-diff-ts';

// Two versions of data
const oldData = { name: 'Luke', level: 1, skills: ['piloting'] };
const newData = { name: 'Luke Skywalker', level: 5, skills: ['piloting', 'force'] };

// Calculate differences
const changes = diff(oldData, newData);
console.log(changes);
// Output: [
//   { type: 'UPDATE', key: 'name', value: 'Luke Skywalker', oldValue: 'Luke' },
//   { type: 'UPDATE', key: 'level', value: 5, oldValue: 1 },
//   { type: 'ADD', key: 'skills', value: 'force', embeddedKey: '1' }
// ]

// Apply changes to get the new object
const result = applyChangeset(oldData, changes);
console.log(result); // { name: 'Luke Skywalker', level: 5, skills: ['piloting', 'force'] }
```

### Import Options

**TypeScript / ES Modules:**
```typescript
import { diff } from 'json-diff-ts';
```

**CommonJS:**
```javascript
const { diff } = require('json-diff-ts');
```

## Core Features

### `diff`

Generates a difference set for JSON objects. When comparing arrays, if a specific key is provided, differences are determined by matching elements via this key rather than array indices.

#### Basic Example with Star Wars Data

```typescript
import { diff } from 'json-diff-ts';

// State during A New Hope - Desert planet, small rebel cell
const oldData = {
  location: 'Tatooine',
  mission: 'Rescue Princess',
  status: 'In Progress',
  characters: [
    { id: 'LUKE_SKYWALKER', name: 'Luke Skywalker', role: 'Farm Boy', forceTraining: false },
    { id: 'LEIA_ORGANA', name: 'Princess Leia', role: 'Prisoner', forceTraining: false }
  ],
  equipment: ['Lightsaber', 'Blaster']
};

// State after successful rescue - Base established, characters evolved
const newData = {
  location: 'Yavin Base',
  mission: 'Destroy Death Star',
  status: 'Complete',
  characters: [
    { id: 'LUKE_SKYWALKER', name: 'Luke Skywalker', role: 'Pilot', forceTraining: true, rank: 'Commander' },
    { id: 'HAN_SOLO', name: 'Han Solo', role: 'Smuggler', forceTraining: false, ship: 'Millennium Falcon' }
  ],
  equipment: ['Lightsaber', 'Blaster', 'Bowcaster', 'X-wing Fighter']
};

const diffs = diff(oldData, newData, { embeddedObjKeys: { characters: 'id' } });
console.log(diffs);
// First operations:
// [
//   { type: 'UPDATE', key: 'location', value: 'Yavin Base', oldValue: 'Tatooine' },
//   { type: 'UPDATE', key: 'mission', value: 'Destroy Death Star', oldValue: 'Rescue Princess' },
//   { type: 'UPDATE', key: 'status', value: 'Complete', oldValue: 'In Progress' },
//   ...
// ]
```

#### Advanced Options

##### Path-based Key Identification

```javascript
import { diff } from 'json-diff-ts';

// Using nested paths for sub-arrays
const diffs = diff(oldData, newData, { embeddedObjKeys: { 'characters.equipment': 'id' } });

// Designating root with '.' - useful for complex nested structures
const diffs = diff(oldData, newData, { embeddedObjKeys: { '.characters.allies': 'id' } });
```

##### Type Change Handling

```javascript
import { diff } from 'json-diff-ts';

// Control how type changes are treated
const diffs = diff(oldData, newData, { treatTypeChangeAsReplace: false });
```

Date objects can now be updated to primitive values without errors when `treatTypeChangeAsReplace` is set to `false`.

##### Skip Nested Paths

```javascript
import { diff } from 'json-diff-ts';

// Skip specific nested paths from comparison - useful for ignoring metadata
const diffs = diff(oldData, newData, { keysToSkip: ['characters.metadata'] });
```

##### Dynamic Key Resolution

```javascript
import { diff } from 'json-diff-ts';

// Use function to resolve object keys dynamically
const diffs = diff(oldData, newData, {
  embeddedObjKeys: {
    characters: (obj, shouldReturnKeyName) => (shouldReturnKeyName ? 'id' : obj.id)
  }
});

// Access index for array elements
const rebels = [
  { name: 'Luke Skywalker', faction: 'Jedi' },
  { name: 'Yoda', faction: 'Jedi' },
  { name: 'Princess Leia', faction: 'Rebellion' }
];

const diffs = diff(oldRebels, newRebels, {
  embeddedObjKeys: {
    rebels: (obj, shouldReturnKeyName, index) => {
      if (shouldReturnKeyName) return 'faction';
      // Use index to differentiate rebels in the same faction
      return `faction.${obj.faction}.${index}`;
    }
  }
});
```

##### Regular Expression Paths

```javascript
import { diff } from 'json-diff-ts';

// Use regex for path matching - powerful for dynamic property names
const embeddedObjKeys = new Map();
embeddedObjKeys.set(/^characters/, 'id');  // Match any property starting with 'characters'
const diffs = diff(oldData, newData, { embeddedObjKeys });
```

##### String Array Comparison

```javascript
import { diff } from 'json-diff-ts';

// Compare string arrays by value instead of index - useful for tags, categories
const diffs = diff(oldData, newData, { embeddedObjKeys: { equipment: '$value' } });
```

### `atomizeChangeset` and `unatomizeChangeset`

Transform complex changesets into a list of atomic changes (and back), each describable by a JSONPath.

```javascript
import { atomizeChangeset, unatomizeChangeset } from 'json-diff-ts';

// Create atomic changes
const atomicChanges = atomizeChangeset(diffs);

// Restore the changeset from a selection of atomic changes
const changeset = unatomizeChangeset(atomicChanges.slice(0, 3));
```

**Atomic Changes Structure:**

```javascript
[
  { 
    type: 'UPDATE', 
    key: 'location', 
    value: 'Yavin Base', 
    oldValue: 'Tatooine', 
    path: '$.location', 
    valueType: 'String' 
  },
  { 
    type: 'UPDATE', 
    key: 'mission', 
    value: 'Destroy Death Star', 
    oldValue: 'Rescue Princess', 
    path: '$.mission', 
    valueType: 'String' 
  },
  { 
    type: 'ADD', 
    key: 'rank', 
    value: 'Commander', 
    path: "$.characters[?(@.id=='LUKE_SKYWALKER')].rank", 
    valueType: 'String' 
  },
  { 
    type: 'ADD', 
    key: 'HAN_SOLO', 
    value: { id: 'HAN_SOLO', name: 'Han Solo', role: 'Smuggler', forceTraining: false, ship: 'Millennium Falcon' }, 
    path: "$.characters[?(@.id=='HAN_SOLO')]", 
    valueType: 'Object' 
  }
]
```

### `applyChangeset` and `revertChangeset`

Apply or revert changes to JSON objects.

```javascript
import { applyChangeset, revertChangeset } from 'json-diff-ts';

// Apply changes
const updated = applyChangeset(oldData, diffs);
console.log(updated);
// { location: 'Yavin Base', mission: 'Destroy Death Star', status: 'Complete', ... }

// Revert changes
const reverted = revertChangeset(newData, diffs);
console.log(reverted);
// { location: 'Tatooine', mission: 'Rescue Princess', status: 'In Progress', ... }
```

## API Reference

### Core Functions

| Function | Description | Parameters |
|----------|-------------|------------|
| `diff(oldObj, newObj, options?)` | Generate differences between two objects | `oldObj`: Original object<br>`newObj`: Updated object<br>`options`: Optional configuration |
| `applyChangeset(obj, changeset)` | Apply changes to an object | `obj`: Object to modify<br>`changeset`: Changes to apply |
| `revertChangeset(obj, changeset)` | Revert changes from an object | `obj`: Object to modify<br>`changeset`: Changes to revert |
| `atomizeChangeset(changeset)` | Convert changeset to atomic changes | `changeset`: Nested changeset |
| `unatomizeChangeset(atomicChanges)` | Convert atomic changes back to nested changeset | `atomicChanges`: Array of atomic changes |

### Comparison Functions

| Function | Description | Parameters |
|----------|-------------|------------|
| `compare(oldObj, newObj)` | Create enriched comparison object | `oldObj`: Original object<br>`newObj`: Updated object |
| `enrich(obj)` | Create enriched representation of object | `obj`: Object to enrich |
| `createValue(value)` | Create value node for comparison | `value`: Any value |
| `createContainer(value)` | Create container node for comparison | `value`: Object or Array |

### Options Interface

```typescript
interface Options {
  embeddedObjKeys?: Record<string, string | Function> | Map<string | RegExp, string | Function>;
  keysToSkip?: string[];
  treatTypeChangeAsReplace?: boolean;
}
```

| Option | Type | Description |
| ------ | ---- | ----------- |
| `embeddedObjKeys` | `Record<string, string \| Function>` or `Map<string  \| RegExp, string \| Function>` | Map paths of arrays to a key or resolver function used to match elements when diffing. Use a `Map` for regex paths. |
| `keysToSkip` | `string[]` | Dotted paths to exclude from comparison, e.g. `"meta.info"`. |
| `treatTypeChangeAsReplace` | `boolean` | When `true` (default), a type change results in a REMOVE/ADD pair. Set to `false` to treat it as an UPDATE. |

### Change Types

```typescript
enum Operation {
  REMOVE = 'REMOVE',
  ADD = 'ADD', 
  UPDATE = 'UPDATE'
}
```

## Release Notes

- **v4.9.0:** Enhanced array handling for `undefined` values - arrays with `undefined` elements can now be properly reconstructed from changesets. Fixed issue where transitions to `undefined` in arrays were treated as removals instead of updates (fixes issue #316)
- **v4.8.2:** Fixed array handling in `applyChangeset` for null, undefined, and deleted elements (fixes issue #316)
- **v4.8.1:** Improved documentation with working examples and detailed options.
- **v4.8.0:** Significantly reduced bundle size by completely removing es-toolkit dependency and implementing custom utility functions. This change eliminates external dependencies while maintaining identical functionality and improving performance.

- **v4.7.0:** Optimized bundle size and performance by replacing es-toolkit/compat with es-toolkit for difference, intersection, and keyBy functions

- **v4.6.3:** Fixed null comparison returning update when values are both null (fixes issue #284)

- **v4.6.2:** Fixed updating to null when `treatTypeChangeAsReplace` is false and bumped Jest dev dependencies
- **v4.6.1:** Consistent JSONPath format for array items (fixes issue #269)
- **v4.6.0:** Fixed filter path regex to avoid polynomial complexity
- **v4.5.1:** Updated package dependencies
- **v4.5.0:** Switched internal utilities from lodash to es-toolkit/compat for a smaller bundle size
- **v4.4.0:** Fixed Date-to-string diff when `treatTypeChangeAsReplace` is false
- **v4.3.0:** Enhanced functionality:
  - Added support for nested keys to skip using dotted path notation in the keysToSkip option
  - This allows excluding specific nested object paths from comparison (fixes #242)
- **v4.2.0:** Improved stability with multiple fixes:
  - Fixed object handling in atomizeChangeset and unatomizeChangeset
  - Fixed array handling in applyChangeset and revertChangeset
  - Fixed handling of null values in applyChangeset
  - Fixed handling of empty REMOVE operations when diffing from undefined
- **v4.1.0:** Full support for ES modules while maintaining CommonJS compatibility
- **v4.0.0:** Changed naming of flattenChangeset and unflattenChanges to atomizeChangeset and unatomizeChangeset; added option to set treatTypeChangeAsReplace
- **v3.0.1:** Fixed issue with unflattenChanges when a key has periods
- **v3.0.0:** Added support for both CommonJS and ECMAScript Modules. Replaced lodash-es with lodash to support both module formats
- **v2.2.0:** Fixed lodash-es dependency, added exclude keys option, added string array comparison by value
- **v2.1.0:** Fixed JSON Path filters by replacing single equal sign (=) with double equal sign (==). Added support for using '.' as root in paths
- **v2.0.0:** Upgraded to ECMAScript module format with optimizations and improved documentation. Fixed regex path handling (breaking change: now requires Map instead of Record for regex paths)
- **v1.2.6:** Enhanced JSON Path handling for period-inclusive segments
- **v1.2.5:** Added key name resolution support for key functions
- **v1.2.4:** Documentation updates and dependency upgrades
- **v1.2.3:** Updated dependencies and TypeScript

## Contributing

Contributions are welcome! Please follow the provided issue templates and code of conduct.

## Performance & Bundle Size

- **Zero dependencies**: No external runtime dependencies
- **Lightweight**: ~21KB minified, ~6KB gzipped
- **Tree-shakable**: Use only what you need with ES modules
- **High performance**: Optimized for large JSON objects and arrays

## Use Cases

- **State Management**: Track changes in Redux, Zustand, or custom state stores  
- **Form Handling**: Detect field changes in React, Vue, or Angular forms
- **Data Synchronization**: Sync data between client and server efficiently
- **Version Control**: Implement undo/redo functionality
- **API Optimization**: Send only changed data to reduce bandwidth
- **Real-time Updates**: Track changes in collaborative applications

## Comparison with Alternatives

| Feature | json-diff-ts | deep-diff | jsondiffpatch |
|---------|--------------|-----------|---------------|
| TypeScript | ✅ Native | ❌ Partial | ❌ Definitions only |
| Bundle Size | 🟢 21KB | 🟡 45KB | 🔴 120KB+ |
| Dependencies | 🟢 Zero | 🟡 Few | 🔴 Many |
| ESM Support | ✅ Native | ❌ CJS only | ❌ CJS only |
| Array Key Matching | ✅ Advanced | ❌ Basic | ✅ Advanced |
| JSONPath Support | ✅ Full | ❌ None | ❌ Limited |

## FAQ

**Q: Can I use this with React/Vue/Angular?**  
A: Yes! json-diff-ts works with any JavaScript framework or vanilla JS.

**Q: Does it work with Node.js?**  
A: Absolutely! Supports Node.js 18+ with both CommonJS and ES modules.

**Q: How does it compare to JSON Patch (RFC 6902)?**  
A: json-diff-ts provides a more flexible format with advanced array handling, while JSON Patch is a standardized format.

**Q: Is it suitable for large objects?**  
A: Yes, the library is optimized for performance and can handle large, complex JSON structures efficiently.

## Contact

Reach out to the maintainer:

- LinkedIn: [Christian Glessner](https://www.linkedin.com/in/christian-glessner/)
- Twitter: [@leitwolf_io](https://twitter.com/leitwolf_io)

Discover more about the company behind this project: [hololux](https://hololux.com)

## Acknowledgments

This project takes inspiration and code from [diff-json](https://www.npmjs.com/package/diff-json) by viruschidai@gmail.com.

## License

json-diff-ts is open-sourced software licensed under the [MIT license](LICENSE).

The original diff-json project is also under the MIT License. For more information, refer to its [license details](https://www.npmjs.com/package/diff-json#license).
