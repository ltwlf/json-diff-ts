# json-diff-ts

![Master CI/Publish](https://github.com/ltwlf/json-diff-ts/workflows/Master%20CI/Publish/badge.svg)
[![Known Vulnerabilities](https://snyk.io/test/github/ltwlf/json-diff-ts/badge.svg?targetFile=package.json)](https://snyk.io/test/github/ltwlf/json-diff-ts?targetFile=package.json)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=ltwlf_json-diff-ts&metric=alert_status)](https://sonarcloud.io/dashboard?id=ltwlf_json-diff-ts)

`json-diff-ts` is a TypeScript library designed to compute and apply differences between JSON objects. It introduces support for identifying array elements by keys rather than indices, and is compatible with JSONPath for addressing specific parts of a JSON document.

## Installation

```sh
npm install json-diff-ts
```

## Capabilities

### `diff`

Generates a difference set for JSON objects. When comparing arrays, if a specific key is provided, differences are determined by matching elements via this key rather than array indices.

#### Examples using Star Wars data:

```javascript
import { diff } from 'json-diff-ts';

const oldData = {
  planet: 'Tatooine',
  faction: 'Jedi',
  characters: [
    { id: 'LUK', name: 'Luke Skywalker', force: true },
    { id: 'LEI', name: 'Leia Organa', force: true }
  ]
};

const newData = {
  planet: 'Alderaan',
  faction: 'Rebel Alliance',
  characters: [
    { id: 'LUK', name: 'Luke Skywalker', force: true, rank: 'Commander' },
    { id: 'HAN', name: 'Han Solo', force: false }
  ]
};

const diffs = diff(oldData, newData, { arrayKey: { characters: 'id' } });

const expectedDiffs = [
  {
    type: 'update',
    key: 'planet',
    value: 'Alderaan',
    oldValue: 'Tatooine'
  },
  {
    type: 'update',
    key: 'faction',
    value: 'Rebel Alliance',
    oldValue: 'Jedi'
  },
  {
    type: 'update',
    key: 'characters',
    embededKey: 'id',
    changes: [
      {
        type: 'add',
        key: 'HAN',
        value: { id: 'HAN', name: 'Han Solo', force: false }
      },
      {
        type: 'remove',
        key: 'LEI',
        oldValue: { id: 'LEI', name: 'Leia Organa', force: true }
      },
      {
        type: 'update',
        key: 'LUK',
        changes: [{ type: 'add', key: 'rank', value: 'Commander' }]
      }
    ]
  }
];
```

### `flattenChangeset`

Transforms a complex changeset into a flat list of atomic changes, each describable by a JSONPath.

#### Examples:

```javascript
const flatChanges = flattenChangeset(diffs);
// Restore the changeset from a selection of flat changes
const changeset = unflattenChanges(flatChanges.slice(0, 3));
// Alternatively, apply the changes using a JSONPath-capable library
// ...
```

A **flatChange** will have the following structure:

```javascript
[
  { type: 'UPDATE', key: 'planet', value: 'Alderaan', oldValue: 'Tatooine', path: '$.planet', valueType: 'String' },
  // ... Additional flat changes here
  { type: 'ADD', key: 'rank', value: 'Commander', path: "$.characters[?(@.id=='LUK')].rank", valueType: 'String' }
];
```

### `applyChange`

#### Examples:

```javascript
const oldData = {
  // ... Initial data here
};

// Sample diffs array, similar to the one generated in the diff example
const diffs = [
  // ... Diff objects here
];

changesets.applyChanges(oldData, diffs);

expect(oldData).to.eql({
  // ... Updated data here
});
```

### `revertChange`

#### Examples:

```javascript
const newData = {
  // ... Updated data here
};

// Sample diffs array
const diffs = [
  // ... Diff objects here
];

changesets.revertChanges(newData, diffs);

expect(newData).to.eql({
  // ... Original data restored here
});
```

### `jsonPath`

The `json-diff-ts` library uses JSONPath to address specific parts of a JSON document in both the changeset and the application/reversion of changes.

#### Examples:

```javascript

const jsonPath = changesets.jsonPath;

cost data = {
  // ... Some JSON data
};

const value = jsonPath.query(data, '$.characters[?(@.id=="LUK")].name');

expect(value).to.eql(['Luke Skywalker']);
```

## Contributing

Contributions are welcome! Please follow the provided issue templates and code of conduct.

## Contact

Reach out to the maintainer via LinkedIn or Twitter:

- LinkedIn: [Christian Glessner](https://www.linkedin.com/in/christian-glessner/)
- Twitter: [@leitwolf_io](https://twitter.com/leitwolf_io)

Discover more about the company behind this project: [hololux](https://hololux.com)

## Release Notes

- **v2.0.0:** tbd
- **v1.2.6:** Enhanced JSON Path handling for period-inclusive segments.
- **v1.2.5:** Patched dependencies; added key name resolution support for key functions.
- **v1.2.4:** Documentation updates; upgraded TypeScript and Lodash.
- **v1.2.3:** Dependency updates; switched to TypeScript 4.5.2.
- **v1.2.2:** Implemented object key resolution functions support.

## Acknowledgments

This project takes inspiration and code from [diff-json](https://www.npmjs.com/package/diff-json) by viruschidai@gmail.com.

## License

json-diff-ts is open-sourced software licensed under the [MIT license](LICENSE).

The original diff-json project is also under the MIT License. For more information, refer to its [license details](https://www.npmjs.com/package/diff-json#license).
