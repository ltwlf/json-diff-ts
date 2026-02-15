import { setByPath, splitJSONPath } from './helpers.js';
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
    case 'Array':
      return (object as any[])
        .map((value) => enrich(value))
        .reduce((accumulator, value) => {
          accumulator.value.push(value);
          return accumulator;
        }, createContainer([]));
    case 'Function':
      return undefined;
    case 'Date':
    default:
      // Primitive value
      return createValue(object);
  }
};

/**
 * Converts an atomized JSONPath (e.g. `$.items[0].name`) into a navigation
 * path through the enriched tree (e.g. `value.items.value[0].value.name`).
 *
 * The enriched tree wraps every level in `{ type, value }` nodes, so between
 * each logical key/index we must step through `.value` to unwrap the container.
 */
const buildEnrichedPath = (atomicPath: string): string => {
  const segments = splitJSONPath(atomicPath);
  // segments[0] is always '$' (the JSONPath root)

  let result = 'value'; // enter the root container's value

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;

    // Match segments like "items[0]" or "variants[12]"
    const arrayMatch = /^(.+?)\[(\d+)\]$/.exec(seg);

    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      // key.value  → unwrap the array container, then [index] into the array
      result += `.${key}.value[${index}]`;
    } else {
      result += `.${seg}`;
    }

    // For non-leaf segments, unwrap the next container
    if (!isLast) {
      result += '.value';
    }
  }

  return result;
};

const applyChangelist = (object: IComparisonEnrichedNode, changelist: IAtomicChange[]): IComparisonEnrichedNode => {
  changelist.forEach((entry) => {
    const path = buildEnrichedPath(entry.path);

    switch (entry.type) {
      case Operation.ADD:
      case Operation.UPDATE:
        setByPath(object, path, { type: entry.type, value: entry.value, oldValue: entry.oldValue });
        break;
      case Operation.REMOVE:
        setByPath(object, path, { type: entry.type, value: undefined, oldValue: entry.value });
        break;
      default:
        throw new Error();
    }
  });
  return object;
};

const ARRAY_WRAPPER_KEY = '_$arr';

const compare = (oldObject: any, newObject: any): IComparisonEnrichedNode => {
  // Root-level arrays produce $root paths that don't map to real properties.
  // Wrap them in an object so diff/atomize generates standard property paths.
  if (Array.isArray(oldObject) || Array.isArray(newObject)) {
    const wrappedOld = { [ARRAY_WRAPPER_KEY]: oldObject };
    const wrappedNew = { [ARRAY_WRAPPER_KEY]: newObject };
    const enriched = enrich(wrappedOld);
    const changes = atomizeChangeset(diff(wrappedOld, wrappedNew));
    const result = applyChangelist(enriched, changes);
    return (result.value as any)[ARRAY_WRAPPER_KEY];
  }

  return applyChangelist(enrich(oldObject), atomizeChangeset(diff(oldObject, newObject)));
};

export { CompareOperation, IComparisonEnrichedNode, createValue, createContainer, enrich, applyChangelist, compare };
