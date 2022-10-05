# json-diff-ts

![Master CI/Publish](https://github.com/ltwlf/json-diff-ts/workflows/Master%20CI/Publish/badge.svg)
[![Known Vulnerabilities](https://snyk.io/test/github/ltwlf/json-diff-ts/badge.svg?targetFile=package.json)](https://snyk.io/test/github/ltwlf/json-diff-ts?targetFile=package.json)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=ltwlf_json-diff-ts&metric=alert_status)](https://sonarcloud.io/dashboard?id=ltwlf_json-diff-ts)

TypeScript diff tool with support for array keys instead of just indexes and compatible with JSONPath.

## Features

### diff

If a embedded key is specified for an array, the diff will be generated based on the objects with the same keys.

#### Examples:

```javascript
var changesets = require('json-diff-ts');
var newObj, oldObj;

oldObj = {
  name: 'joe',
  age: 55,
  coins: [2, 5],
  children: [
    { name: 'kid1', age: 1 },
    { name: 'kid2', age: 2 }
  ]
};

newObj = {
  name: 'smith',
  coins: [2, 5, 1],
  children: [
    { name: 'kid3', age: 3 },
    { name: 'kid1', age: 0 },
    { name: 'kid2', age: 2 }
  ]
};

// Assume children is an array of child object and the child object has 'name' as its primary key
// keys can also be hierarchical e.g. {children: 'name', 'children.grandChildren', 'age'}
// or use functions that return the key of an object e.g. {children: function(obj) { return obj.key; }}
// when you use a function flatten can not generate the correct path.
// to fix this, you can add an additional parameter e.g. (obj, getKeyNameFlag) => {...}. getKeyNameFlag will be true when the diff library try to resolve the key name instead of the key value. You can return a static string or use obj to check which key name you should return. obj will be the first object of the array!
diffs = changesets.diff(oldObj, newObj, { children: 'name' });

expect(diffs).to.eql([
  {
    type: 'update',
    key: 'name',
    value: 'smith',
    oldValue: 'joe'
  },
  {
    type: 'update',
    key: 'coins',
    embededKey: '$index',
    changes: [{ type: 'add', key: '2', value: 1 }]
  },
  {
    type: 'update',
    key: 'children',
    embededKey: 'name',
    changes: [
      {
        type: 'update',
        key: 'kid1',
        changes: [{ type: 'update', key: 'age', value: 0, oldValue: 1 }]
      },
      {
        type: 'add',
        key: 'kid3',
        value: { name: 'kid3', age: 3 }
      }
    ]
  },
  {
    type: 'remove',
    key: 'age',
    value: 55
  }
]);
```

### flattenChangeset

Converts the changeset into a flat atomic change list compatible with JSONPath.

#### Examples:

```javascript
const flatChanges = flattenChangeset(diffs);
// convert changes back to changeset format
const changeset = unflattenChanges(flatChanges.slice(1, 5));
// or use a JSONPath library to apply the patches
// ...
```

The **flatChange** format will look like this:

```javascript
[
  { type: 'UPDATE', key: 'name', value: 'smith', oldValue: 'joe', path: '$.name', valueType: 'String' },
  { type: 'REMOVE', key: 'mixed', value: 10, path: '$.mixed', valueType: 'Number' },
  { type: 'UPDATE', key: 'inner', value: 2, oldValue: 1, path: '$.nested.inner', valueType: 'Number' },
  {
    type: 'UPDATE',
    key: 'date',
    value: '2014-10-12T09:13:00.000Z',
    oldValue: '2014-10-13T09:13:00.000Z',
    path: '$.date',
    valueType: 'Date'
  },
  { type: 'ADD', key: '2', value: 1, path: '$.coins[2]', valueType: 'Number' },
  { type: 'REMOVE', key: '0', value: 'car', path: '$.toys[0]', valueType: 'String' },
  { type: 'REMOVE', key: '1', value: 'doll', path: '$.toys[1]', valueType: 'String' },
  { type: 'REMOVE', key: '0', path: '$.pets[0]', valueType: 'undefined' },
  { type: 'REMOVE', key: '1', value: null, path: '$.pets[1]', valueType: null },
  { type: 'UPDATE', key: 'age', value: 0, oldValue: 1, path: "$.children[?(@.name='kid1')].age", valueType: 'Number' },
  {
    type: 'UPDATE',
    key: 'value',
    value: 'heihei',
    oldValue: 'haha',
    path: "$.children[?(@.name='kid1')].subset[?(@.id='1')].value",
    valueType: 'String'
  },
  {
    type: 'REMOVE',
    key: '2',
    value: { id: 2, value: 'hehe' },
    path: "$.children[?(@.name='kid1')].subset[?(@.id='2')]",
    valueType: 'Object'
  },
  { type: 'ADD', key: 'kid3', value: { name: 'kid3', age: 3 }, path: '$.children', valueType: 'Object' }
];
```

### applyChange

#### Examples:

```javascript
var changesets = require('json-diff-ts');
var oldObj = {
  name: 'joe',
  age: 55,
  coins: [2, 5],
  children: [
    { name: 'kid1', age: 1 },
    { name: 'kid2', age: 2 }
  ]
};

// Assume children is an array of child object and the child object has 'name' as its primary key
diffs = [
  {
    type: 'update',
    key: 'name',
    value: 'smith',
    oldValue: 'joe'
  },
  {
    type: 'update',
    key: 'coins',
    embededKey: '$index',
    changes: [{ type: 'add', key: '2', value: 1 }]
  },
  {
    type: 'update',
    key: 'children',
    embededKey: 'name', // The key property name of the elements in an array
    changes: [
      {
        type: 'update',
        key: 'kid1',
        changes: [{ type: 'update', key: 'age', value: 0, oldValue: 1 }]
      },
      {
        type: 'add',
        key: 'kid3',
        value: { name: 'kid3', age: 3 }
      }
    ]
  },
  {
    type: 'remove',
    key: 'age',
    value: 55
  }
];

changesets.applyChanges(oldObj, diffs);
expect(oldObj).to.eql({
  name: 'smith',
  coins: [2, 5, 1],
  children: [
    { name: 'kid3', age: 3 },
    { name: 'kid1', age: 0 },
    { name: 'kid2', age: 2 }
  ]
});
```

### revertChange

#### Examples:

```javascript

  var changesets = require('json-diff-ts');

  var newObj = {
    name: 'smith',
    coins: [2, 5, 1],
    children: [
      {name: 'kid3', age: 3},
      {name: 'kid1', age: 0},
      {name: 'kid2', age: 2}
   ]};

  // Assume children is an array of child object and the child object has 'name' as its primary key
  diffs =  [
    {
      type: 'update', key: 'name', value: 'smith', oldValue: 'joe'
    },
    {
      type: 'update', key: 'coins', embededKey: '$index', changes: [
          {type: 'add', key: '2', value: 1 }
        ]
    },
    {
      type: 'update',
      key: 'children',
      embededKey: 'name', // The key property name of the elements in an array
      changes: [
        {
          type: 'update', key: 'kid1', changes: [
            {type: 'update', key: 'age', value: 0, oldValue: 1 }
          ]
        },
        {
          type: 'add', key: 'kid3', value: {name: 'kid3', age: 3 }
        }
      ]
    },
    {
      type: 'remove', key: 'age', value: 55
    }
  ]

  changesets.revertChanges(newObj, diffs)
  expect(newObj).to.eql {
    name: 'joe',
    age: 55,
    coins: [2, 5],
    children: [
      {name: 'kid1', age: 1},
      {name: 'kid2', age: 2}
    ]};

```

## Get started

```
npm install json-diff-ts
```

## Run the test

```
npm run test
```

## Contact

Blog: https://blog.leitwolf.io

Twitter: [@cglessner](https://twitter.com/cglessner)

## Changelog

- v1.2.5 Patch all dependencies; add support for resolving a key name if a function is used to get the key value
- v1.2.4 Fix readme (npm install); update TypeScript and Lodash
- v1.2.3 Update outdated dependencies; update TypeScript version to 4.5.2
- v1.2.2 Add support for functions to resove object keys (PR by [Abraxxa](https://github.com/abraxxa))

## Credits

This project was based on https://www.npmjs.com/package/diff-json (viruschidai@gmail.com)

## Licence

**The MIT License (MIT)**

Copyright (c) 2019 Christian Glessner

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The project is based on diff-json (https://www.npmjs.com/package/diff-json). Copyright 2013 viruschidai@gmail.com. for additional details.

**Original License**

The MIT License (MIT)

Copyright (c) 2013 viruschidai@gmail.com

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
