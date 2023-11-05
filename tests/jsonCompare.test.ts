import { compare, CompareOperation, IComparisonEnrichedNode, enrich } from '../src/jsonCompare';
import { Operation } from '../src/jsonDiff';

let testedObject: any;
let enrichedObject: IComparisonEnrichedNode;

beforeEach(() => {
  const prepareTestCase = (): any => ({
    undefined: undefined,
    null: null,
    number: 1,
    string: '1',
    date: new Date('October 13, 2014 11:13:00'),
    emptyObject: {},
    emptyArray: []
  });

  const testCase = prepareTestCase();

  testedObject = {
    ...testCase,
    objectWithTestCase: { ...testCase },
    ...Object.keys(testCase).reduce(
      (accumulator, key) => {
        accumulator['arrayWith' + key] = [testCase[key]];
        return accumulator;
      },
      {} as { [key: string]: any }
    )
  };

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
  });

  const enrichedTestCase = prepareEnrichedObject();

  enrichedObject = {
    type: CompareOperation.CONTAINER,
    value: {
      ...enrichedTestCase,
      objectWithTestCase: {
        type: CompareOperation.CONTAINER,
        value: { ...enrichedTestCase }
      },
      ...Object.keys(enrichedTestCase).reduce(
        (accumulator, key) => {
          accumulator['arrayWith' + key] = { type: CompareOperation.CONTAINER, value: [enrichedTestCase[key]] };
          return accumulator;
        },
        {} as { [key: string]: any }
      )
    }
  };
});

describe('jsonCompare#compare', () => {
  it('enriches an empty object correctly', (done) => {
    const comparison = enrich({});
    expect(comparison).toMatchObject({ type: CompareOperation.CONTAINER, value: {} });
    done();
  });

  it('enriches a complex object correctly', (done) => {
    const comparison = enrich(testedObject);
    expect(comparison).toMatchObject(enrichedObject);
    done();
  });

  it('applies flattened diff results correctly', (done) => {
    const oldObject = {
      code: 'code',
      variants: [
        {
          identifier: 'variantId',
          nested: {
            nestedValue: 1,
            unchanged: 1,
            deleted: 'x'
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
      code: 'newCode',
      variants: [
        {
          identifier: 'newVariantId',
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
    };

    const result = compare(oldObject, newObject);
    expect(result).toMatchObject({
      type: CompareOperation.CONTAINER,
      value: {
        code: {
          type: Operation.UPDATE,
          value: 'newCode',
          oldValue: 'code'
        },
        variants: {
          type: CompareOperation.CONTAINER,
          value: [
            {
              type: CompareOperation.CONTAINER,
              value: {
                identifier: {
                  type: Operation.UPDATE,
                  value: 'newVariantId',
                  oldValue: 'variantId'
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
                      value: 1
                    },
                    deleted: {
                      type: Operation.REMOVE,
                      value: undefined,
                      oldValue: 'x'
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
    });
    done();
  });
});
