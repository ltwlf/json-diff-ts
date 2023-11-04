# json-diff-ts

![Master CI/Publish](https://github.com/ltwlf/json-diff-ts/workflows/Master%20CI/Publish/badge.svg)
[![Known Vulnerabilities](https://snyk.io/test/github/ltwlf/json-diff-ts/badge.svg?targetFile=package.json)](https://snyk.io/test/github/ltwlf/json-diff-ts?targetFile=package.json)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=ltwlf_json-diff-ts&metric=alert_status)](https://sonarcloud.io/dashboard?id=ltwlf_json-diff-ts)

json-diff-ts is a TypeScript-based library that provides robust tools for calculating differences between JSON objects. It offers unique features such as support for array keys beyond simple indexes and full compatibility with JSONPath.

## Capabilities

### Diffing with `diff`

Generates a diff for JSON objects, with an optional parameter to specify keys within arrays, allowing for key-based comparison rather than index-based.

#### Usage Example:

```javascript
const changesets = require('json-diff-ts');

let oldObj = {
  // original JSON object
};

let newObj = {
  // new JSON object with changes
};

// Generate diff with 'name' as the key for array items in 'children'
let diffs = changesets.diff(oldObj, newObj, { children: 'name' });

// diffs will contain a comprehensive list of changes between oldObj and newObj
```

### Flatten Changes with `flattenChangeset`

Converts complex changesets into a flattened list of atomic changes that adhere to JSONPath syntax.

#### Usage Example:

```javascript
const flatChanges = flattenChangeset(diffs);

// flatChanges now contains a simplified array of changes
// These changes can be converted back to a changeset or applied using a JSONPath library
```

### Applying Changes with `applyChange`

Applies a changeset to a JSON object to update it with new changes.

#### Usage Example:

```javascript
changesets.applyChanges(oldObj, diffs);

// oldObj is now updated with the changes described in diffs
```

### Reverting Changes with `revertChange`

Allows for reverting applied changes from a JSON object, effectively undoing the diff.

#### Usage Example:

```javascript
changesets.revertChanges(newObj, diffs);

// newObj is reverted back to its original state before the diffs were applied
```

## Getting Started

Install the package with npm:

```
npm install json-diff-ts
```

## Testing the Library

Execute the test suite using npm:

```
npm run test
```

## Connect

Reach out to the maintainer via LinkedIn or Twitter:

- LinkedIn: [Christian Glessner](https://www.linkedin.com/in/christian-glessner/)
- Twitter: [@cglessner](https://twitter.com/leitwolf_io)

Discover more about the company behind this project: [hololux](https://hololux.com)

## Release Notes

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
