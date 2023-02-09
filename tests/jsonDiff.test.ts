import {
  applyChangeset,
  diff,
  flattenChangeset,
  IChange,
  Operation,
  revertChangeset,
  unflattenChanges
} from '../src/jsonDiff';

let oldObj: any;
let newObj: any;
let changesetWithoutEmbeddedKey: IChange[];
let changeset: IChange[];
let changesetWithDoubleRemove: IChange[];
let changesetWithFunctionKey: IChange[];

beforeEach((done) => {
  oldObj = {
    name: 'joe',
    age: 55,
    mixed: 10,
    nested: { inner: 1 },
    empty: undefined,
    date: new Date('October 13, 2014 11:13:00'),
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
  };

  newObj = {
    name: 'smith',
    mixed: '10',
    nested: { inner: 2 },
    date: new Date('October 12, 2014 11:13:00'),
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
  };

  changeset = [
    { type: Operation.UPDATE, key: 'name', value: 'smith', oldValue: 'joe' },
    { type: Operation.UPDATE, key: 'mixed', oldValue: 10, value: '10' },
    {
      type: Operation.UPDATE,
      key: 'nested',
      changes: [{ type: Operation.UPDATE, key: 'inner', value: 2, oldValue: 1 }]
    },
    {
      type: Operation.UPDATE,
      key: 'date',
      value: new Date('October 12, 2014 11:13:00'),
      oldValue: new Date('October 13, 2014 11:13:00')
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

  changesetWithDoubleRemove = [
    { type: Operation.UPDATE, key: 'name', value: 'smith', oldValue: 'joe' },
    { type: Operation.UPDATE, key: 'mixed', oldValue: 10, value: '10' },
    {
      type: Operation.UPDATE,
      key: 'nested',
      changes: [{ type: Operation.UPDATE, key: 'inner', value: 2, oldValue: 1 }]
    },
    {
      type: Operation.UPDATE,
      key: 'date',
      value: new Date('October 12, 2014 11:13:00'),
      oldValue: new Date('October 13, 2014 11:13:00')
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

  changesetWithoutEmbeddedKey = [
    { type: Operation.UPDATE, key: 'name', value: 'smith', oldValue: 'joe' },
    { type: Operation.UPDATE, key: 'mixed', oldValue: 10, value: '10' },
    {
      type: Operation.UPDATE,
      key: 'nested',
      changes: [{ type: Operation.UPDATE, key: 'inner', value: 2, oldValue: 1 }]
    },
    {
      type: Operation.UPDATE,
      key: 'date',
      value: new Date('October 12, 2014 11:13:00'),
      oldValue: new Date('October 13, 2014 11:13:00')
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

  changesetWithFunctionKey = [
    { type: Operation.UPDATE, key: 'name', value: 'smith', oldValue: 'joe' },
    { type: Operation.UPDATE, key: 'mixed', oldValue: 10, value: '10' },
    {
      type: Operation.UPDATE,
      key: 'nested',
      changes: [{ type: Operation.UPDATE, key: 'inner', value: 2, oldValue: 1 }]
    },
    {
      type: Operation.UPDATE,
      key: 'date',
      value: new Date('October 12, 2014 11:13:00'),
      oldValue: new Date('October 13, 2014 11:13:00')
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
      embeddedKey: expect.any(Function),
      changes: [
        {
          type: Operation.UPDATE,
          key: 'kid1',
          changes: [
            { type: Operation.UPDATE, key: 'age', value: 0, oldValue: 1 },
            {
              type: Operation.UPDATE,
              key: 'subset',
              embeddedKey: expect.any(Function),
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
  done();
});

describe('jsonDiff#diff', () => {
  test('should return correct diff for object with embedded array object that does not have key specified', (done) => {
    const diffs = diff(oldObj, newObj);
    expect(diffs).toMatchObject(changesetWithoutEmbeddedKey);
    done();
  });

  test('should return correct diff for object with embedded array object that does have keys', (done) => {
    const diffs = diff(oldObj, newObj, {
      children: 'name',
      'children.subset': 'id'
    });
    expect(diffs).toMatchObject(changeset);
    done();
  });

  test('should return correct diff for object with embedded array object that does have regex key', (done) => {
    const diffs = diff(oldObj, newObj, {
      '^children$': 'name',
      '^[\\w+.]+subset$': 'id'
    });
    expect(diffs).toMatchObject(changeset);
    done();
  });

  test('should return correct diff for object with embedded array object that does have function key', (done) => {
    const diffs = diff(oldObj, newObj, {
      children: function (obj: { name: string }) {
        return obj.name;
      },
      'children.subset': function (obj: { id: number }) {
        return obj.id;
      }
    });
    expect(diffs).toMatchObject(changesetWithFunctionKey);
    done();
  });
});

describe('jsonDiff#applyChangeset', () => {
  test('should transfer oldObj to newObj with changeset', (done) => {
    applyChangeset(oldObj, changeset);
    newObj.children.sort((a: any, b: any) => (a.name > b.name ? 1 : -1));
    expect(oldObj).toMatchObject(newObj);
    done();
  });

  test('should transfer oldObj to newObj with changesetWithoutEmbeddedKey', (done) => {
    applyChangeset(oldObj, changesetWithoutEmbeddedKey);
    newObj.children.sort((a: any, b: any) => a.name > b.name);
    oldObj.children.sort((a: any, b: any) => a.name > b.name);
    expect(oldObj).toMatchObject(newObj);
    done();
  });
  test('Removing non existing array elements should be ignored', (done) => {
    applyChangeset(oldObj, changesetWithDoubleRemove);
    newObj.children.sort((a: any, b: any) => (a.name > b.name ? 1 : -1));
    expect(oldObj).toMatchObject(newObj);
    done();
  });
});

describe('jsonDiff#revertChangeset', () => {
  test('should transfer newObj to oldObj with changeset', (done) => {
    revertChangeset(newObj, changeset);
    newObj.children.sort((a: any, b: any) => a.name > b.name);
    expect(newObj).toMatchObject(oldObj);
    done();
  });

  test('should transfer newObj to oldObj with changesetWithoutEmbeddedKey', (done) => {
    revertChangeset(newObj, changesetWithoutEmbeddedKey);
    newObj.children.sort((a: any, b: any) => a.name > b.name);
    expect(newObj).toMatchObject(oldObj);
    done();
  });
});

describe('jsonDiff#flatten', () => {
  test('flatten changes, unflatten and apply', (done) => {
    const diffs = diff(oldObj, newObj, {
      children: 'name',
      'children.subset': 'id'
    });

    const flat = flattenChangeset(diffs);
    const unflat = unflattenChanges(flat);

    applyChangeset(oldObj, unflat);

    newObj.children = newObj.children.sort((a: any, b: any) => (a.name > b.name ? 1 : -1));
    oldObj.children = oldObj.children.sort((a: any, b: any) => (a.name > b.name ? 1 : -1));

    expect(oldObj).toStrictEqual(newObj);

    done();
  });

  test('Start with blank object, flatten changes, unflatten and apply', (done) => {
    const beforeObj = {};
    const afterObj = newObj;

    const diffs = diff(beforeObj, afterObj, {});

    const flat = flattenChangeset(diffs);
    const unflat = unflattenChanges(flat);

    applyChangeset(beforeObj, unflat);

    expect(beforeObj).toMatchObject(afterObj);

    done();
  });

  test('Get key name for flattening when using a key function', (done) => {
    const beforeObj = {
      items: [
        {
          _id: '1'
        }
      ]
    };

    const afterObj = {
      items: [
        {
          _id: '2'
        }
      ]
    };

    const diffs = diff(beforeObj, afterObj, {
      items: (obj, getKeyName) => {
        if (getKeyName) {
          if (obj?._id) {
            return '_id';
          }
          return '$index';
        }
        if (obj?._id) {
          return obj?._id;
        }
        return '$index';
      }
    });

    const flat = flattenChangeset(diffs);

    expect(flat).toMatchSnapshot();

    done();
  });
});
