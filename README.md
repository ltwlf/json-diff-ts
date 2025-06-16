# json-diff-ts

[![CI](https://github.com/ltwlf/json-diff-ts/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/ltwlf/json-diff-ts/actions/workflows/ci.yml)
[![Known Vulnerabilities](https://snyk.io/test/github/ltwlf/json-diff-ts/badge.svg?targetFile=package.json)](https://snyk.io/test/github/ltwlf/json-diff-ts?targetFile=package.json)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=ltwlf_json-diff-ts&metric=alert_status)](https://sonarcloud.io/dashboard?id=ltwlf_json-diff-ts)

## Overview

`json-diff-ts` is a TypeScript library that calculates and applies differences between JSON objects. It offers several advanced features:

- **Key-based array identification**: Compare array elements using keys instead of indices for more intuitive diffing
- **JSONPath support**: Target specific parts of JSON documents with precision
- **Atomic changesets**: Transform changes into granular, independently applicable operations
- **Dual module support**: Works with both ECMAScript Modules and CommonJS

This library is particularly valuable for applications where tracking changes in JSON data is crucial, such as state management systems, form handling, or data synchronization.

## Installation

```sh
npm install json-diff-ts
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

const oldData = {
  planet: 'Tatooine',
  faction: 'Jedi',
  characters: [
    { id: 'LUK', name: 'Luke Skywalker', force: true },
    { id: 'LEI', name: 'Leia Organa', force: true }
  ],
  weapons: ['Lightsaber', 'Blaster']
};

const newData = {
  planet: 'Alderaan',
  faction: 'Rebel Alliance',
  characters: [
    { id: 'LUK', name: 'Luke Skywalker', force: true, rank: 'Commander' },
    { id: 'HAN', name: 'Han Solo', force: false }
  ],
  weapons: ['Lightsaber', 'Blaster', 'Bowcaster']
};

const diffs = diff(oldData, newData, { embeddedObjKeys: { characters: 'id' } });
```

#### Advanced Options

##### Path-based Key Identification

```javascript
// Using nested paths
const diffs = diff(oldData, newData, { embeddedObjKeys: { 'characters.subarray': 'id' } });

// Designating root with '.'
const diffs = diff(oldData, newData, { embeddedObjKeys: { '.characters.subarray': 'id' } });
```

##### Type Change Handling

```javascript
// Control how type changes are treated
const diffs = diff(oldData, newData, { treatTypeChangeAsReplace: false });
```

Date objects can now be updated to primitive values without errors when `treatTypeChangeAsReplace` is set to `false`.

##### Skip Nested Paths

```javascript
// Skip specific nested paths from comparison
const diffs = diff(oldData, newData, { keysToSkip: ['property.address'] });
```

##### Dynamic Key Resolution

```javascript
// Use function to resolve object keys
const diffs = diff(oldData, newData, {
  embeddedObjKeys: {
    characters: (obj, shouldReturnKeyName) => (shouldReturnKeyName ? 'id' : obj.id)
  }
});
```

##### Regular Expression Paths

```javascript
// Use regex for path matching
const embeddedObjKeys = new Map();
embeddedObjKeys.set(/^char\w+$/, 'id');
const diffs = diff(oldObj, newObj, { embeddedObjKeys });
```

##### String Array Comparison

```javascript
// Compare string arrays by value instead of index
const diffs = diff(oldObj, newObj, { embeddedObjKeys: { stringArr: '$value' } });
```

### `atomizeChangeset` and `unatomizeChangeset`

Transform complex changesets into a list of atomic changes (and back), each describable by a JSONPath.

```javascript
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
    key: 'planet', 
    value: 'Alderaan', 
    oldValue: 'Tatooine', 
    path: '$.planet', 
    valueType: 'String' 
  },
  // More atomic changes...
  { 
    type: 'ADD', 
    key: 'rank', 
    value: 'Commander', 
    path: "$.characters[?(@.id=='LUK')].rank", 
    valueType: 'String' 
  }
]
```

### `applyChanges` and `revertChanges`

Apply or revert changes to JSON objects.

```javascript
// Apply changes
changesets.applyChanges(oldData, diffs);

// Revert changes
changesets.revertChanges(newData, diffs);
```

### `jsonPath`

Query specific parts of a JSON document.

```javascript
const jsonPath = changesets.jsonPath;

const data = {
  characters: [
    { id: 'LUK', name: 'Luke Skywalker' }
  ]
};

const value = jsonPath.query(data, '$.characters[?(@.id=="LUK")].name');
// Returns ['Luke Skywalker']
```

## Release Notes

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