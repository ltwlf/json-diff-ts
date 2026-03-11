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

// ─── Comparison Serialization ──────────────────────────────────────────────

export interface IComparisonDict {
  type: string;
  value?: any;
  oldValue?: any;
}

export interface IFlatChange {
  path: string;
  type: string;
  value?: any;
  oldValue?: any;
}

/**
 * Recursively serializes an enriched comparison tree to a plain JSON object.
 * Includes `value`/`oldValue` based on change type, not truthiness —
 * `null` is preserved as a valid JSON value.
 */
const comparisonToDict = (node: IComparisonEnrichedNode): IComparisonDict => {
  const result: IComparisonDict = { type: node.type };

  if (node.type === CompareOperation.CONTAINER) {
    if (Array.isArray(node.value)) {
      result.value = (node.value as IComparisonEnrichedNode[])
        .filter((child) => child != null)
        .map(comparisonToDict);
    } else if (node.value && typeof node.value === 'object') {
      const obj: Record<string, IComparisonDict> = {};
      for (const [key, child] of Object.entries(
        node.value as Record<string, IComparisonEnrichedNode>
      )) {
        if (child == null) continue;
        obj[key] = comparisonToDict(child);
      }
      result.value = obj;
    }
  } else {
    // Leaf: include fields based on change type
    if (
      node.type === CompareOperation.UNCHANGED ||
      node.type === Operation.ADD ||
      node.type === Operation.UPDATE
    ) {
      result.value = node.value;
    }
    if (node.type === Operation.REMOVE || node.type === Operation.UPDATE) {
      result.oldValue = node.oldValue;
    }
  }

  return result;
};

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Flattens an enriched comparison tree to a list of leaf changes with paths.
 * Uses dot notation for identifier keys and bracket-quote notation for
 * non-identifier keys (per spec Section 5.5).
 *
 * By default, `UNCHANGED` entries are excluded. Set `includeUnchanged: true`
 * to include them.
 */
const comparisonToFlatList = (
  node: IComparisonEnrichedNode,
  options: { includeUnchanged?: boolean } = {}
): IFlatChange[] => {
  const results: IFlatChange[] = [];
  flattenNode(node, '$', options.includeUnchanged ?? false, results);
  return results;
};

function flattenNode(
  node: IComparisonEnrichedNode,
  path: string,
  includeUnchanged: boolean,
  results: IFlatChange[]
): void {
  if (node.type === CompareOperation.CONTAINER) {
    if (Array.isArray(node.value)) {
      for (let i = 0; i < (node.value as IComparisonEnrichedNode[]).length; i++) {
        const child = (node.value as IComparisonEnrichedNode[])[i];
        if (child == null) continue;
        flattenNode(child, `${path}[${i}]`, includeUnchanged, results);
      }
    } else if (node.value && typeof node.value === 'object') {
      for (const [key, child] of Object.entries(
        node.value as Record<string, IComparisonEnrichedNode>
      )) {
        if (child == null) continue;
        const childPath = IDENT_RE.test(key)
          ? `${path}.${key}`
          : `${path}['${key.replace(/'/g, "''")}']`;
        flattenNode(child, childPath, includeUnchanged, results);
      }
    }
    return;
  }

  if (node.type === CompareOperation.UNCHANGED && !includeUnchanged) {
    return;
  }

  const entry: IFlatChange = { path, type: node.type };
  if (
    node.type === CompareOperation.UNCHANGED ||
    node.type === Operation.ADD ||
    node.type === Operation.UPDATE
  ) {
    entry.value = node.value;
  }
  if (node.type === Operation.REMOVE || node.type === Operation.UPDATE) {
    entry.oldValue = node.oldValue;
  }
  results.push(entry);
}

export {
  CompareOperation,
  IComparisonEnrichedNode,
  createValue,
  createContainer,
  enrich,
  applyChangelist,
  compare,
  comparisonToDict,
  comparisonToFlatList,
};
