import { keys } from 'lodash-es'
import {
  compare,
  CompareOperation,
  IComparisonEnrichedNode,
  enrich
} from '../src/jsonCompare'
import { Operation } from '../src/jsonDiff'

let testedObject: any
let enrichedObject: IComparisonEnrichedNode

beforeEach(done => {
  const prepareTestCase = (): any => ({
    undefined: undefined,
    null: null,
    number: 1,
    string: '1',
    date: new Date('October 13, 2014 11:13:00'),
    emptyObject: {},
    emptyArray: []
  });

  testedObject = {
    ...prepareTestCase(),
    objectWithTestCase: prepareTestCase(),
    ...(keys(prepareTestCase()).map(key => ({ key, value: [prepareTestCase()[key]] })).reduce((accumulator, entry) => {
      accumulator["arrayWith" + entry.key] = entry.value
      return accumulator;
    }, {} as { [key: string]: any }))
  }

  const prepareEnrichedObject = (): { [key: string]: IComparisonEnrichedNode } => ({
    undefined: {
      type: CompareOperation.UNCHANGED,
      value: undefined
    },
    null: {
      type: CompareOperation.UNCHANGED,
      value: null
    },
    number: {
      type: CompareOperation.UNCHANGED,
      value: 1
    },
    string: {
      type: CompareOperation.UNCHANGED,
      value: '1'
    },
    date: {
      type: CompareOperation.UNCHANGED,
      value: new Date('October 13, 2014 11:13:00')
    },
    emptyObject: {
      type: CompareOperation.CONTAINER,
      value: {}
    },
    emptyArray: {
      type: CompareOperation.CONTAINER,
      value: []
    }
  })

  enrichedObject = {
    type: CompareOperation.CONTAINER,
    value: {
      ...prepareEnrichedObject(),
      objectWithTestCase: {
        type: CompareOperation.CONTAINER,
        value: prepareEnrichedObject()
      },
      ...(keys(prepareEnrichedObject())
        .map(key => ({ key, value: { type: CompareOperation.CONTAINER, value: [prepareEnrichedObject()[key]] } }))
        .reduce((accumulator, entry) => {
          accumulator["arrayWith" + entry.key] = entry.value
          return accumulator;
        }, {} as { [key: string]: any }))
    }
  }
  done()
})

describe('jsonCompare#compare', () => {
  test('should enrich empty object', done => {
    const comparison = enrich({})
    expect(comparison).toMatchObject({ type: CompareOperation.CONTAINER, value: {} })
    done()
  })
  test('should enrich complex object', done => {
    const comparison = enrich(testedObject)
    expect(comparison).toMatchObject(enrichedObject)
    done()
  })
  test('Should apply flattened diff results', done => {
    const oldObject = {
      code: "code",
      variants: [
        {
          identifier: "variantId",
          nested: {
            nestedValue: 1,
            unchanged: 1,
            deleted: "x"
          },
          levels: [
            {
              multiplier: 1
            }
          ]
        }
      ]
    };

    const newObject = {
      code: "newCode",
      variants: [
        {
          identifier: "newVariantId",
          nested: {
            nestedValue: 2,
            unchanged: 1,
            new: 1
          },
          levels: [
            {
              multiplier: 0
            }
          ]
        }
      ]
    }

    const result = compare(oldObject, newObject);
    expect(result).toMatchObject({
      type: CompareOperation.CONTAINER,
      value: {
        code: {
          type: Operation.UPDATE,
          value: "newCode",
          oldValue: "code"
        },
        variants: {
          type: CompareOperation.CONTAINER,
          value: [
            {
              type: CompareOperation.CONTAINER,
              value: {
                identifier: {
                  type: Operation.UPDATE,
                  value: "newVariantId",
                  oldValue: "variantId"
                },
                nested: {
                  type: CompareOperation.CONTAINER,
                  value: {
                    nestedValue: {
                      type: Operation.UPDATE,
                      value: 2,
                      oldValue: 1
                    },
                    unchanged: {
                      type: CompareOperation.UNCHANGED,
                      value: 1,
                    },
                    deleted: {
                      type: Operation.REMOVE,
                      value: undefined,
                      oldValue: "x"
                    },
                    new: {
                      type: Operation.ADD,
                      value: 1
                    }
                  }
                },
                levels: {
                  type: CompareOperation.CONTAINER,
                  value: [
                    {
                      type: CompareOperation.CONTAINER,
                      value: {
                        multiplier: {
                          type: Operation.UPDATE,
                          value: 0,
                          oldValue: 1
                        }
                      }
                    }
                  ]
                }
              }
            }
          ]
        }
      }
    })
    done()
  })
})
