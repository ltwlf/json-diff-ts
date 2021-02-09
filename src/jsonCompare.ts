import { diff, flattenChangeset, getTypeOfObj, IFlatChange, Operation } from "./jsonDiff";
import { keys, chain, replace, set } from "lodash"

export enum CompareOperation {
  CONTAINER = "CONTAINER",
  UNCHANGED = "UNCHANGED"
}

export interface ComparisonEnrichedNode {
  type: Operation | CompareOperation,
  value: ComparisonEnrichedNode | ComparisonEnrichedNode[] | any | any[],
  oldValue?: any
}

export const createValue = (value: any): ComparisonEnrichedNode => ({ type: CompareOperation.UNCHANGED, value });
export const createContainer = (value: object | []): ComparisonEnrichedNode => ({ type: CompareOperation.CONTAINER, value });

export const enrich = (object: any): ComparisonEnrichedNode => {
  const objectType = getTypeOfObj(object);

  switch (objectType) {
    case 'Object':
      return keys(object)
        .map((key: string) => ({ key, value: enrich(object[key]) }))
        .reduce((accumulator, entry) => {
          accumulator.value[entry.key] = entry.value
          return accumulator
        }, createContainer({}));
    case 'Array':
      return chain(object)
        .map(value => enrich(value))
        .reduce((accumulator, value) => {
          accumulator.value.push(value)
          return accumulator;
        }, createContainer([]))
        .value()
    case 'Function':
      return undefined;
    case 'Date':
    default: // Primitive value
      return createValue(object);
  }
};

export const applyChangelist = (object: ComparisonEnrichedNode, changelist: IFlatChange[]): ComparisonEnrichedNode => {
  chain(changelist)
    .map(entry => ({ ...entry, path: replace(entry.path, "$.", ".") }))
    .map(entry => ({ ...entry, path: replace(entry.path, /(\[(?<array>\d)\]\.)/g, "ARRVAL_START$<array>ARRVAL_END") }))
    .map(entry => ({ ...entry, path: replace(entry.path, /(?<dot>\.)/g, ".value$<dot>") }))
    .map(entry => ({ ...entry, path: replace(entry.path, /\./, "") }))
    .map(entry => ({ ...entry, path: replace(entry.path, /ARRVAL_START/g, ".value[") }))
    .map(entry => ({ ...entry, path: replace(entry.path, /ARRVAL_END/g, "].value.") }))
    .value()
    .forEach(entry => {
      switch (entry.type) {
        case Operation.ADD:
        case Operation.UPDATE:
          set(
            object,
            entry.path,
            { type: entry.type, value: entry.value, oldValue: entry.oldValue }
          )
          break;
        case Operation.REMOVE:
          set(
            object,
            entry.path,
            { type: entry.type, value: undefined, oldValue: entry.value }
          )
          break;
        default:
          throw new Error();
      }
    })
  return object;
}

export const compare = (oldObject: any, newObject: any): ComparisonEnrichedNode => {
  return applyChangelist(enrich(oldObject), flattenChangeset(diff(oldObject, newObject)));
}