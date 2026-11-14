import { IChange, Operation } from '../../src/jsonDiff';

export const oldObj: any = () =>
  ({
    name: 'joe',
    age: 55,
    mixed: 10,
    nested: { inner: 1 },
    empty: undefined,
    date: new Date('October 13, 2014 11:13:00Z'),
    coins: [2, 5],
    toys: ['car', 'doll', 'car'],
    pets: [undefined, null],
    children: [
      {
        name: 'kid1',
        age: 1,
        subset: [
          { id: 1, value: 'haha' },
          { id: 2, value: 'hehe' }
        ]
      },
      { name: 'kid2', age: 2 }
    ]
  }) as any;

export const newObj: any = () =>
  ({
    name: 'smith',
    mixed: '10',
    nested: { inner: 2 },
    date: new Date('October 12, 2014 11:13:00Z'),
    coins: [2, 5, 1],
    toys: [],
    pets: [],
    children: [
      { name: 'kid3', age: 3 },
      {
        name: 'kid1',
        age: 0,
        subset: [{ id: 1, value: 'heihei' }]
      },
      { name: 'kid2', age: 2 }
    ]
  }) as any;

export const changeset: IChange[] = [
  { type: Operation.UPDATE, key: 'name', value: 'smith', oldValue: 'joe' },
  { type: Operation.REMOVE, key: 'mixed', value: 10 },
  { type: Operation.ADD, key: 'mixed', value: '10' },
  {
    type: Operation.UPDATE,
    key: 'nested',
    changes: [{ type: Operation.UPDATE, key: 'inner', value: 2, oldValue: 1 }]
  },
  {
    type: Operation.UPDATE,
    key: 'date',
    value: new Date('October 12, 2014 11:13:00Z'),
    oldValue: new Date('October 13, 2014 11:13:00Z')
  },
  {
    type: Operation.UPDATE,
    key: 'coins',
    embeddedKey: '$index',
    changes: [{ type: Operation.ADD, key: '2', value: 1 }]
  },
  {
    type: Operation.UPDATE,
    key: 'toys',
    embeddedKey: '$index',
    changes: [
      { type: Operation.REMOVE, key: '0', value: 'car' },
      { type: Operation.REMOVE, key: '1', value: 'doll' },
      { type: Operation.REMOVE, key: '2', value: 'car' }
    ]
  },
  {
    type: Operation.UPDATE,
    key: 'pets',
    embeddedKey: '$index',
    changes: [
      { type: Operation.REMOVE, key: '0', value: undefined },
      { type: Operation.REMOVE, key: '1', value: null }
    ]
  },
  {
    type: Operation.UPDATE,
    key: 'children',
    embeddedKey: 'name',
    changes: [
      {
        type: Operation.UPDATE,
        key: 'kid1',
        changes: [
          { type: Operation.UPDATE, key: 'age', value: 0, oldValue: 1 },
          {
            type: Operation.UPDATE,
            key: 'subset',
            embeddedKey: 'id',
            changes: [
              {
                type: Operation.UPDATE,
                key: '1',
                changes: [
                  {
                    type: Operation.UPDATE,
                    key: 'value',
                    value: 'heihei',
                    oldValue: 'haha'
                  }
                ]
              },
              {
                type: Operation.REMOVE,
                key: '2',
                value: { id: 2, value: 'hehe' }
              }
            ]
          }
        ]
      },
      { type: Operation.ADD, key: 'kid3', value: { name: 'kid3', age: 3 } }
    ]
  },

  { type: Operation.REMOVE, key: 'age', value: 55 },
  { type: Operation.REMOVE, key: 'empty', value: undefined }
];

export const changesetWithDoubleRemove: IChange[] = [
  { type: Operation.UPDATE, key: 'name', value: 'smith', oldValue: 'joe' },
  { type: Operation.REMOVE, key: 'mixed', value: 10 },
  { type: Operation.ADD, key: 'mixed', value: '10' },
  {
    type: Operation.UPDATE,
    key: 'nested',
    changes: [{ type: Operation.UPDATE, key: 'inner', value: 2, oldValue: 1 }]
  },
  {
    type: Operation.UPDATE,
    key: 'date',
    value: new Date('October 12, 2014 11:13:00Z'),
    oldValue: new Date('October 13, 2014 11:13:00Z')
  },
  {
    type: Operation.UPDATE,
    key: 'coins',
    embeddedKey: '$index',
    changes: [{ type: Operation.ADD, key: '2', value: 1 }]
  },
  {
    type: Operation.UPDATE,
    key: 'toys',
    embeddedKey: '$index',
    changes: [
      { type: Operation.REMOVE, key: '0', value: 'car' },
      { type: Operation.REMOVE, key: '1', value: 'doll' },
      { type: Operation.REMOVE, key: '2', value: 'car' }
    ]
  },
  {
    type: Operation.UPDATE,
    key: 'pets',
    embeddedKey: '$index',
    changes: [
      { type: Operation.REMOVE, key: '0', value: undefined },
      { type: Operation.REMOVE, key: '1', value: null }
    ]
  },
  {
    type: Operation.UPDATE,
    key: 'children',
    embeddedKey: 'name',
    changes: [
      {
        type: Operation.UPDATE,
        key: 'kid1',
        changes: [
          { type: Operation.UPDATE, key: 'age', value: 0, oldValue: 1 },
          {
            type: Operation.UPDATE,
            key: 'subset',
            embeddedKey: 'id',
            changes: [
              {
                type: Operation.UPDATE,
                key: '1',
                changes: [
                  {
                    type: Operation.UPDATE,
                    key: 'value',
                    value: 'heihei',
                    oldValue: 'haha'
                  }
                ]
              },
              {
                type: Operation.REMOVE,
                key: '2',
                value: { id: 2, value: 'hehe' }
              },
              {
                type: Operation.REMOVE,
                key: '2',
                value: { id: 2, value: 'hehe' }
              }
            ]
          }
        ]
      },
      { type: Operation.ADD, key: 'kid3', value: { name: 'kid3', age: 3 } }
    ]
  },

  { type: Operation.REMOVE, key: 'age', value: 55 },
  { type: Operation.REMOVE, key: 'empty', value: undefined }
];

export const changesetWithoutEmbeddedKey: IChange[] = [
  { type: Operation.UPDATE, key: 'name', value: 'smith', oldValue: 'joe' },
  { type: Operation.REMOVE, key: 'mixed', value: 10 },
  { type: Operation.ADD, key: 'mixed', value: '10' },
  {
    type: Operation.UPDATE,
    key: 'nested',
    changes: [{ type: Operation.UPDATE, key: 'inner', value: 2, oldValue: 1 }]
  },
  {
    type: Operation.UPDATE,
    key: 'date',
    value: new Date('October 12, 2014 11:13:00Z'),
    oldValue: new Date('October 13, 2014 11:13:00Z')
  },
  {
    type: Operation.UPDATE,
    key: 'coins',
    embeddedKey: '$index',
    changes: [{ type: Operation.ADD, key: '2', value: 1 }]
  },
  {
    type: Operation.UPDATE,
    key: 'toys',
    embeddedKey: '$index',
    changes: [
      { type: Operation.REMOVE, key: '0', value: 'car' },
      { type: Operation.REMOVE, key: '1', value: 'doll' },
      { type: Operation.REMOVE, key: '2', value: 'car' }
    ]
  },
  {
    type: Operation.UPDATE,
    key: 'pets',
    embeddedKey: '$index',
    changes: [
      { type: Operation.REMOVE, key: '0', value: undefined },
      { type: Operation.REMOVE, key: '1', value: null }
    ]
  },
  {
    type: Operation.UPDATE,
    key: 'children',
    embeddedKey: '$index',
    changes: [
      {
        type: Operation.UPDATE,
        key: '0',
        changes: [
          {
            type: Operation.UPDATE,
            key: 'name',
            value: 'kid3',
            oldValue: 'kid1'
          },
          { type: Operation.UPDATE, key: 'age', value: 3, oldValue: 1 },
          {
            type: Operation.REMOVE,
            key: 'subset',
            value: [
              { id: 1, value: 'haha' },
              { id: 2, value: 'hehe' }
            ]
          }
        ]
      },
      {
        type: Operation.UPDATE,
        key: '1',
        changes: [
          {
            type: Operation.UPDATE,
            key: 'name',
            value: 'kid1',
            oldValue: 'kid2'
          },
          { type: Operation.UPDATE, key: 'age', value: 0, oldValue: 2 },
          {
            type: Operation.ADD,
            key: 'subset',
            value: [{ id: 1, value: 'heihei' }]
          }
        ]
      },
      { type: Operation.ADD, key: '2', value: { name: 'kid2', age: 2 } }
    ]
  },

  { type: Operation.REMOVE, key: 'age', value: 55 },
  { type: Operation.REMOVE, key: 'empty', value: undefined }
];

export const assortedDiffs: {
  oldVal: unknown;
  newVal: unknown;
  expectedReplacement: IChange[];
  expectedUpdate: IChange[];
}[] = [
  {
    oldVal: 1,
    newVal: 'a',
    expectedReplacement: [
      { type: Operation.REMOVE, key: '$root', value: 1 },
      { type: Operation.ADD, key: '$root', value: 'a' }
    ],
    expectedUpdate: [{ type: Operation.UPDATE, key: '$root', value: 'a', oldValue: 1 }]
  },
  {
    oldVal: [],
    newVal: null,
    expectedReplacement: [
      { type: Operation.REMOVE, key: '$root', value: [] },
      { type: Operation.ADD, key: '$root', value: null }
    ],
    expectedUpdate: [{ type: Operation.UPDATE, key: '$root', value: null, oldValue: [] }]
  },
  {
    oldVal: {},
    newVal: null,
    expectedReplacement: [
      { type: Operation.REMOVE, key: '$root', value: {} },
      { type: Operation.ADD, key: '$root', value: null }
    ],
    expectedUpdate: [{ type: Operation.UPDATE, key: '$root', value: null, oldValue: {} }]
  },
  {
    oldVal: undefined,
    newVal: null,
    expectedReplacement: [
      { type: Operation.ADD, key: '$root', value: null }
    ],
    expectedUpdate: [{ type: Operation.UPDATE, key: '$root', value: null, oldValue: undefined }]
  },
  {
    oldVal: 1,
    newVal: null,
    expectedReplacement: [
      { type: Operation.REMOVE, key: '$root', value: 1 },
      { type: Operation.ADD, key: '$root', value: null }
    ],
    expectedUpdate: [{ type: Operation.UPDATE, key: '$root', value: null, oldValue: 1 }]
  },
  {
    oldVal: [],
    newVal: null,
    expectedReplacement: [
      { type: Operation.REMOVE, key: '$root', value: [] },
      { type: Operation.ADD, key: '$root', value: null }
    ],
    expectedUpdate: [{ type: Operation.UPDATE, key: '$root', value: null, oldValue: [] }]
  },
  {
    oldVal: [],
    newVal: undefined,
    expectedReplacement: [{ type: Operation.REMOVE, key: '$root', value: [] }],
    expectedUpdate: [{ type: Operation.REMOVE, key: '$root', value: [] }]
  },
  {
    oldVal: [],
    newVal: 0,
    expectedReplacement: [
      { type: Operation.REMOVE, key: '$root', value: [] },
      { type: Operation.ADD, key: '$root', value: 0 }
    ],
    expectedUpdate: [{ type: Operation.UPDATE, key: '$root', value: 0, oldValue: [] }]
  },
  {
    oldVal: [],
    newVal: 1,
    expectedReplacement: [
      { type: Operation.REMOVE, key: '$root', value: [] },
      { type: Operation.ADD, key: '$root', value: 1 }
    ],
    expectedUpdate: [{ type: Operation.UPDATE, key: '$root', value: 1, oldValue: [] }]
  },
  {
    oldVal: null,
    newVal: null,
    expectedReplacement: [],
    expectedUpdate: []
  },
];

export const indexArrayRevertCases: {
  name: string;
  oldVal: unknown[];
  newVal: unknown[];
}[] = [
  { name: 'array grown at the end', oldVal: ['a'], newVal: ['a', 'b', 'c'] },
  { name: 'array shrunk at the end', oldVal: ['a', 'b', 'c'], newVal: ['a'] },
  { name: 'array filled from empty', oldVal: [], newVal: ['a', 'b', 'c'] },
  { name: 'array emptied', oldVal: ['a', 'b', 'c'], newVal: [] },
  { name: 'replace pair at a single index', oldVal: ['a', 2], newVal: [false, 2] },
  { name: 'every element replaced by another type', oldVal: ['a', 1, 'b', 2], newVal: [1, 'a', 2, 'b'] },
  { name: 'replace pair with trailing removes', oldVal: ['a', 'b', 'c'], newVal: [true] },
  { name: 'replace pair with trailing adds', oldVal: [true], newVal: ['a', 'b', 'c'] },
  { name: 'null values added', oldVal: [], newVal: [null, 'a', null] },
  { name: 'null values removed', oldVal: [null, 'a', null], newVal: ['a'] },
  { name: 'nested arrays changed on both sides', oldVal: [['a', 'b'], ['c']], newVal: [['a'], ['c', 'd']] },
  {
    name: 'objects replaced by primitives',
    oldVal: [{ a: 1 }, { b: 2 }],
    newVal: [{ a: 9 }, 'prim']
  }
];
