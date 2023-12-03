# json-diff-ts

![Master CI/Publish](https://github.com/ltwlf/json-diff-ts/workflows/Master%20CI/Publish/badge.svg)
[![Known Vulnerabilities](https://snyk.io/test/github/ltwlf/json-diff-ts/badge.svg?targetFile=package.json)](https://snyk.io/test/github/ltwlf/json-diff-ts?targetFile=package.json)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=ltwlf_json-diff-ts&metric=alert_status)](https://sonarcloud.io/dashboard?id=ltwlf_json-diff-ts)

`json-diff-ts` is a TypeScript library that calculates and applies differences between JSON objects. A standout feature is its ability to identify elements in arrays using keys instead of indices, which offers a more intuitive way to handle arrays. It also supports JSONPath, a query language for JSON, which enables you to target specific parts of a JSON document with precision.

Another significant feature of this library is its ability to transform changesets into atomic changes. This means that each change in the data can be isolated and applied independently, providing a granular level of control over the data manipulation process.

This library is particularly valuable for applications where tracking changes in JSON data is crucial. It simplifies the process of comparing JSON objects and applying changes. The support for key-based array identification can be especially useful in complex JSON structures where tracking by index is not efficient or intuitive. JSONPath support further enhances its capabilities by allowing precise targeting of specific parts in a JSON document, making it a versatile tool for handling JSON data.

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

const diffs = diff(oldData, newData, { characters: 'id' });

const expectedDiffs = [
  {
    type: 'UPDATE',
    key: 'planet',
    value: 'Alderaan',
    oldValue: 'Tatooine'
  },
  {
    type: 'UPDATE',
    key: 'faction',
    value: 'Rebel Alliance',
    oldValue: 'Jedi'
  },
  {
    type: 'UPDATE',
    key: 'characters',
    embeddedKey: 'id',
    changes: [
      {
        type: 'UPDATE',
        key: 'LUK',
        changes: [
          {
            type: 'ADD',
            key: 'rank',
            value: 'Commander'
          }
        ]
      },
      {
        type: 'ADD',
        key: 'HAN',
        value: {
          id: 'HAN',
          name: 'Han Solo',
          force: false
        }
      },
      {
        type: 'REMOVE',
        key: 'LEI',
        value: {
          id: 'LEI',
          name: 'Leia Organa',
          force: true
        }
      }
    ]
  },
  {
    type: 'UPDATE',
    key: 'weapons',
    embeddedKey: '$index',
    changes: [
      {
        type: 'ADD',
        key: '2',
        value: 'Bowcaster'
      }
    ]
  }
];
```

#### Advanced

Paths can be utilized to identify keys within nested arrays.

```javascript
const diffs = diff(oldData, newData, { 'characters.subarray': 'id' });
```

You can also designate the root by using '.' instead of an empty string ('').

```javascript
const diffs = diff(oldData, newData, { '.characters.subarray': 'id' });
```

You can use a function to dynamically resolve the key of the object.
The first parameter is the object and the second is to signal if the function should return the key name instead of the value. This is needed to flatten the changeset

```javascript
const diffs = diff(oldData, newData, {
  characters: (obj, shouldReturnKeyName) => (shouldReturnKeyName ? 'id' : obj.id)
});
```

If you're using the Map type, you can employ regular expressions for path identification.

```javascript
const embeddedObjKeys: EmbeddedObjKeysMapType = new Map();

embeddedObjKeys.set(/^char\w+$/, 'id'); // instead of 'id' you can specify a function

const diffs = diff(oldObj, newObj, embeddedObjKeys);
```

Compare string arrays by value instead of index

```javascript
const diffs = diff(oldObj, newObj, { stringArr: '$value' });
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

- **v2.2.0:** Fix lodash-es decependency, exclude keys, compare string arrays by value
- **v2.1.0:** Resolves a problem related to JSON Path filters by replacing the single equal sign (=) with a double equal sign (==). This update maintains compatibility with existing flat changes. Allows to use either '' or '.' as root in the path.
- **v2.0.0:** json-diff-ts has been upgraded to an ECMAScript module! This major update brings optimizations and enhanced documentation. Additionally, a previously existing issue where all paths were treated as regex has been fixed. In this new version, you'll need to use a Map instead of a Record for regex paths. Please note that this is a breaking change if you were using regex paths in the previous versions.
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
