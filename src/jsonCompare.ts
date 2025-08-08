import { setByPath } from './helpers.js';
import { diff, atomizeChangeset, getTypeOfObj, IAtomicChange, Operation } from './jsonDiff.js';

enum CompareOperation {
  CONTAINER = 'CONTAINER',
  UNCHANGED = 'UNCHANGED'
}

interface IComparisonEnrichedNode {
  type: Operation | CompareOperation;
  value: IComparisonEnrichedNode | IComparisonEnrichedNode[] | any | any[];
  oldValue?: any;
}

const createValue = (value: any): IComparisonEnrichedNode => ({ type: CompareOperation.UNCHANGED, value });
const createContainer = (value: object | []): IComparisonEnrichedNode => ({
  type: CompareOperation.CONTAINER,
  value
});

const enrich = (object: any): IComparisonEnrichedNode => {
  const objectType = getTypeOfObj(object);

  switch (objectType) {
    case 'Object':
      return Object.keys(object)
        .map((key: string) => ({ key, value: enrich(object[key]) }))
        .reduce((accumulator, entry) => {
          accumulator.value[entry.key] = entry.value;
          return accumulator;
        }, createContainer({}));
    case 'Array': {
      const array = object as unknown[];
      return array
        .map((value) => enrich(value))
        .reduce((accumulator, value) => {
          accumulator.value.push(value);
          return accumulator;
        }, createContainer([]));
    }
    case 'Function':
      return undefined;
    case 'Date':
    default:
      // Primitive value
      return createValue(object);
  }
};

const applyChangelist = (object: IComparisonEnrichedNode, changelist: IAtomicChange[]): IComparisonEnrichedNode => {
  changelist
    .map((entry) => ({ ...entry, path: entry.path.replace('$.', '.') }))
    .map((entry) => ({
      ...entry,
      path: entry.path.replace(/(\[(?<array>\d)\]\.)/g, 'ARRVAL_START$<array>ARRVAL_END')
    }))
    .map((entry) => ({ ...entry, path: entry.path.replace(/(?<dot>\.)/g, '.value$<dot>') }))
    .map((entry) => ({ ...entry, path: entry.path.replace(/\./, '') }))
    .map((entry) => ({ ...entry, path: entry.path.replace(/ARRVAL_START/g, '.value[') }))
    .map((entry) => ({ ...entry, path: entry.path.replace(/ARRVAL_END/g, '].value.') }))
    .forEach((entry) => {
      switch (entry.type) {
        case Operation.ADD:
        case Operation.UPDATE:
          setByPath(object, entry.path, { type: entry.type, value: entry.value, oldValue: entry.oldValue });
          break;
        case Operation.REMOVE:
          setByPath(object, entry.path, { type: entry.type, value: undefined, oldValue: entry.value });
          break;
        default:
          throw new Error();
      }
    });
  return object;
};

const compare = (oldObject: any, newObject: any): IComparisonEnrichedNode => {
  return applyChangelist(enrich(oldObject), atomizeChangeset(diff(oldObject, newObject)));
};

export { CompareOperation, IComparisonEnrichedNode, createValue, createContainer, enrich, applyChangelist, compare };
