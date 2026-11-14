import { atomicPathToAtomPath, parseAtomPath } from './atomPath.js';
import { arrayDifference as difference, arrayIntersection as intersection, keyBy, FunctionKey } from './helpers.js';

type EmbeddedObjKeysType = Record<string, string | FunctionKey>;
type EmbeddedObjKeysMapType = Map<string | RegExp, string | FunctionKey>;
enum Operation {
  REMOVE = 'REMOVE',
  ADD = 'ADD',
  UPDATE = 'UPDATE'
}

interface IChange {
  type: Operation;
  key: string;
  embeddedKey?: string | FunctionKey;
  /** When true, embeddedKey is a dot-separated nested path (e.g. "a.b" → @.a.b). */
  embeddedKeyIsPath?: boolean;
  value?: any;
  oldValue?: any;
  changes?: IChange[];
}
type Changeset = IChange[];

interface IAtomicChange {
  type: Operation;
  key: string;
  path: string;
  valueType: string | null;
  value?: any;
  oldValue?: any;
}

interface Options {
  /** Identify array elements by a stable key instead of index. */
  arrayIdentityKeys?: EmbeddedObjKeysType | EmbeddedObjKeysMapType;
  /** @deprecated Use `arrayIdentityKeys` instead. */
  embeddedObjKeys?: EmbeddedObjKeysType | EmbeddedObjKeysMapType;
  keysToSkip?: readonly string[];
  /** Compare only these paths and their descendants. Array element keys are omitted. */
  keysToInclude?: readonly string[];
  treatTypeChangeAsReplace?: boolean;
}

/**
 * Computes the difference between two objects.
 *
 * @param {any} oldObj - The original object.
 * @param {any} newObj - The updated object.
 * @param {Options} options - An optional parameter specifying keys of embedded objects and keys to skip.
 * @returns {IChange[]} - An array of changes that transform the old object into the new object.
 */
function diff(oldObj: any, newObj: any, options: Options = {}): IChange[] {
  let embeddedObjKeys = options.arrayIdentityKeys ?? options.embeddedObjKeys;
  const { keysToSkip, keysToInclude, treatTypeChangeAsReplace } = options;

  // Trim leading '.' from keys in embeddedObjKeys
  if (embeddedObjKeys instanceof Map) {
    embeddedObjKeys = new Map(
      Array.from(embeddedObjKeys.entries()).map(([key, value]) => [
        key instanceof RegExp ? key : key.replace(/^\./, ''),
        value
      ])
    );
  } else if (embeddedObjKeys) {
    embeddedObjKeys = Object.fromEntries(
      Object.entries(embeddedObjKeys).map(([key, value]) => [key.replace(/^\./, ''), value])
    );
  }

  // Compare old and new objects to generate a list of changes
  return compare(oldObj, newObj, [], [], {
    embeddedObjKeys,
    keysToSkip: keysToSkip ?? [],
    keysToInclude,
    treatTypeChangeAsReplace: treatTypeChangeAsReplace ?? true
  });
}

/**
 * Applies all changes in the changeset to the object.
 *
 * @param {any} obj - The object to apply changes to.
 * @param {Changeset} changeset - The changeset to apply.
 * @returns {any} - The object after the changes from the changeset have been applied.
 *
 * The function first checks if a changeset is provided. If so, it iterates over each change in the changeset.
 * If the change value is not null or undefined, or if the change type is REMOVE, or if the value is null and the type is ADD,
 * it applies the change to the object directly.
 * Otherwise, it applies the change to the corresponding branch of the object.
 */
const applyChangeset = (obj: any, changeset: Changeset) => {
  if (changeset) {
    changeset.forEach((change) => {
      const { type, key, value, embeddedKey } = change;

      // Handle null values as leaf changes when the operation is ADD
      // Also handle undefined values for ADD operations in array contexts
      if ((value !== null && value !== undefined) || 
          type === Operation.REMOVE || 
          (value === null && type === Operation.ADD) ||
          (value === undefined && type === Operation.ADD)) {
        // Apply the change to the object
        applyLeafChange(obj, change, embeddedKey);
      } else {
        // Apply the change to the branch
        // When key is '$root', apply to obj itself (root-level arrays)
        applyBranchChange(key === '$root' ? obj : obj[key], change);
      }
    });
  }
  return obj;
};

/**
 * Reverts the changes made to an object based on a given changeset.
 *
 * @param {any} obj - The object on which to revert changes.
 * @param {Changeset} changeset - The changeset to revert.
 * @returns {any} - The object after the changes from the changeset have been reverted.
 *
 * The function first checks if a changeset is provided. If so, it reverses the changeset to start reverting from the last change.
 * It then iterates over each change in the changeset. If the change does not have any nested changes, or if the value is null and
 * the type is REMOVE (which would be reverting an ADD operation), it reverts the change on the object directly.
 * If the change does have nested changes, it reverts the changes on the corresponding branch of the object.
 */
const revertChangeset = (obj: any, changeset: Changeset) => {
  if (changeset) {
    [...changeset]
      .reverse()
      .forEach((change: IChange): any => {
        const { value, type } = change;
        // Handle null values as leaf changes when the operation is REMOVE (since we're reversing ADD)
        if (!change.changes || (value === null && type === Operation.REMOVE)) {
          revertLeafChange(obj, change);
        } else {
          // When key is '$root', revert on obj itself (root-level arrays)
          revertBranchChange(change.key === '$root' ? obj : obj[change.key], change);
        }
      });
  }

  return obj;
};

/**
 * Atomize a changeset into an array of single changes.
 *
 * @param {Changeset | IChange} obj - The changeset or change to flatten.
 * @param {string} [path='$'] - The current path in the changeset.
 * @param {string | FunctionKey} [embeddedKey] - The key to use for embedded objects.
 * @returns {IAtomicChange[]} - An array of atomic changes.
 *
 * The function first checks if the input is an array. If so, it recursively atomize each change in the array.
 * If the input is not an array, it checks if the change has nested changes or an embedded key.
 * If so, it updates the path and recursively flattens the nested changes or the embedded object.
 * If the change does not have nested changes or an embedded key, it creates a atomic change and returns it in an array.
 */
const atomizeChangeset = (
  obj: Changeset | IChange,
  path = '$',
  embeddedKey?: string | FunctionKey,
  embeddedKeyIsPath?: boolean
): IAtomicChange[] => {
  if (Array.isArray(obj)) {
    return handleArray(obj, path, embeddedKey, embeddedKeyIsPath);
  } else if (obj.changes || embeddedKey) {
    if (embeddedKey) {
      const [updatedPath, atomicChange] = handleEmbeddedKey(embeddedKey, obj, path, embeddedKeyIsPath);
      path = updatedPath;
      if (atomicChange) {
        return atomicChange;
      }
      if (!obj.changes) {
        return [{ ...obj, path, valueType: getTypeOfObj(obj.value) }];
      }
    } else {
      path = append(path, obj.key);
    }
    return atomizeChangeset(obj.changes || obj, path, obj.embeddedKey, obj.embeddedKeyIsPath);
  } else {
    const valueType = getTypeOfObj(obj.value);
    const finalPath = append(path, obj.key);

    return [
      {
        ...obj,
        path: finalPath,
        valueType
      }
    ];
  }
};

// Function to handle embeddedKey logic and update the path
function handleEmbeddedKey(embeddedKey: string | FunctionKey, obj: IChange, path: string, isPath?: boolean): [string, IAtomicChange[]?] {
  if (embeddedKey === '$index') {
    path = `${path}[${obj.key}]`;
    return [path];
  } else if (embeddedKey === '$value') {
    path = `${path}[?(@=='${obj.key}')]`;
    const valueType = getTypeOfObj(obj.value);
    return [
      path,
      [
        {
          ...obj,
          path,
          valueType
        }
      ]
    ];
  } else {
    path = filterExpression(path, embeddedKey as string, obj.key, isPath);
    return [path];
  }
}

const handleArray = (obj: Changeset | IChange[], path: string, embeddedKey?: string | FunctionKey, embeddedKeyIsPath?: boolean): IAtomicChange[] => {
  return obj.reduce((memo, change) => [...memo, ...atomizeChangeset(change, path, embeddedKey, embeddedKeyIsPath)], [] as IAtomicChange[]);
};

/**
 * Transforms an atomized changeset into a nested changeset.
 *
 * @param {IAtomicChange | IAtomicChange[]} changes - The atomic changeset to unflatten.
 * @returns {IChange[]} - The unflattened changeset.
 *
 * The function first checks if the input is a single change or an array of changes.
 * It then iterates over each change and splits its path into segments.
 * For each segment, it checks if it represents an array or a leaf node.
 * If it represents an array, it creates a new change object and updates the pointer to this new object.
 * If it represents a leaf node, it sets the key, type, value, and oldValue of the current change object.
 * Finally, it pushes the unflattened change object into the changes array.
 */
const unatomizeChangeset = (changes: IAtomicChange | IAtomicChange[]): Changeset => {
  return (Array.isArray(changes) ? changes : [changes]).map((change) => {
    const segments = parseAtomPath(atomicPathToAtomPath(change.path)).slice(1);

    const buildChange = (key: string, offset: number): IChange => {
      const segment = segments[offset];
      if (!segment) {
        return { key, type: change.type, value: change.value, oldValue: change.oldValue };
      }
      if (segment.type === 'property') {
        return { key, type: Operation.UPDATE, changes: [buildChange(segment.name, offset + 1)] };
      }
      if (segment.type === 'index' || segment.type === 'keyFilter' || segment.type === 'valueFilter') {
        const embeddedKey = segment.type === 'index' ? '$index'
          : segment.type === 'valueFilter' ? '$value' : segment.property;
        const childKey = segment.type === 'index' ? String(segment.index) : String(segment.value);
        const isPath = segment.type === 'keyFilter' && !segment.literalKey && segment.property.includes('.');
        return {
          key,
          type: Operation.UPDATE,
          embeddedKey,
          ...(isPath ? { embeddedKeyIsPath: true } : {}),
          changes: [buildChange(childKey, offset + 1)]
        };
      }
      throw new Error(`Unexpected root segment in: ${change.path}`);
    };

    const first = segments[0];
    return first?.type === 'property'
      ? buildChange(first.name, 1)
      : buildChange(first ? '$root' : change.key, 0);
  });
};

/**
 * Determines the type of a given object.
 *
 * @param {any} obj - The object whose type is to be determined.
 * @returns {string | null} - The type of the object, or null if the object is null.
 *
 * This function first checks if the object is undefined or null, and returns 'undefined' or null respectively.
 * If the object is neither undefined nor null, it uses Object.prototype.toString to get the object's type.
 * The type is extracted from the string returned by Object.prototype.toString using a regular expression.
 */
const getTypeOfObj = (obj: any) => {
  if (obj === undefined) {
    return 'undefined';
  }

  if (obj === null) {
    return null;
  }

  // Extracts the "Type" from "[object Type]" string.
  return Object.prototype.toString.call(obj).match(/^\[object\s(.*)\]$/)[1];
};

const getKey = (path: string) => {
  const left = path.at(-1);
  return left ?? '$root';
};

/** Keep ancestors of included paths so traversal can reach the selected fields. */
const shouldComparePath = (path: string, options: Options): boolean => {
  if (options.keysToSkip?.some(skip => path === skip || path.startsWith(skip + '.'))) return false;
  return options.keysToInclude === undefined || options.keysToInclude.some(include =>
    path === '' || path === include || path.startsWith(include + '.') || include.startsWith(path + '.')
  );
};

const compare = (oldObj: any, newObj: any, path: any, keyPath: any, options: Options) => {
  let changes: any[] = [];

  if (!shouldComparePath(keyPath.join('.'), options)) return changes;

  const typeOfOldObj = getTypeOfObj(oldObj);
  const typeOfNewObj = getTypeOfObj(newObj);

  // `treatTypeChangeAsReplace` is a flag used to determine if a change in type should be treated as a replacement.
  if (options.treatTypeChangeAsReplace && typeOfOldObj !== typeOfNewObj) {
    // Only add a REMOVE operation if oldObj is not undefined
    if (typeOfOldObj !== 'undefined') {
      changes.push({ type: Operation.REMOVE, key: getKey(path), value: oldObj });
    }

    // Special case: In array contexts, undefined should be treated as a value, not as absence of value
    // Check if we're in an array element context by examining the path
    const lastPathSegment = path[path.length - 1];
    const isArrayElement = path.length > 0 && 
      (typeof lastPathSegment === 'number' || 
       (typeof lastPathSegment === 'string' && /^\d+$/.test(lastPathSegment)));
    
    // As undefined is not serialized into JSON, it should not count as an added value.
    // However, for array elements, we want to preserve undefined as a value
    if (typeOfNewObj !== 'undefined' || isArrayElement) {
      changes.push({ type: Operation.ADD, key: getKey(path), value: newObj });
    }

    return changes;
  }

  if (typeOfNewObj === 'undefined' && typeOfOldObj !== 'undefined') {
    // Special case: In array contexts, undefined should be treated as a value, not as absence of value
    // Check if we're in an array element context by examining the path
    const lastPathSegment = path[path.length - 1];
    const isArrayElement = path.length > 0 && 
      (typeof lastPathSegment === 'number' || 
       (typeof lastPathSegment === 'string' && /^\d+$/.test(lastPathSegment)));
    
    if (isArrayElement) {
      // In array contexts, treat transition to undefined as an update
      changes.push({ type: Operation.UPDATE, key: getKey(path), value: newObj, oldValue: oldObj });
    } else {
      // In object contexts, treat transition to undefined as removal (original behavior)
      changes.push({ type: Operation.REMOVE, key: getKey(path), value: oldObj });
    }
    return changes;
  }

  if (typeOfNewObj === 'Object' && typeOfOldObj === 'Array') {
    changes.push({ type: Operation.UPDATE, key: getKey(path), value: newObj, oldValue: oldObj });
    return changes;
  }

  if (typeOfNewObj === null) {
    if (typeOfOldObj !== null) {
      changes.push({ type: Operation.UPDATE, key: getKey(path), value: newObj, oldValue: oldObj });
    }
    return changes;
  }

  switch (typeOfOldObj) {
    case 'Date':
      if (typeOfNewObj === 'Date') {
        changes = changes.concat(
          comparePrimitives(oldObj.getTime(), newObj.getTime(), path).map((x) => ({
            ...x,
            value: new Date(x.value),
            oldValue: new Date(x.oldValue)
          }))
        );
      } else {
        changes = changes.concat(comparePrimitives(oldObj, newObj, path));
      }
      break;
    case 'Object': {
      const diffs = compareObject(oldObj, newObj, path, keyPath, false, options);
      if (diffs.length) {
        if (path.length) {
          changes.push({
            type: Operation.UPDATE,
            key: getKey(path),
            changes: diffs
          });
        } else {
          changes = changes.concat(diffs);
        }
      }
      break;
    }
    case 'Array':
      changes = changes.concat(compareArray(oldObj, newObj, path, keyPath, options));
      break;
    case 'Function':
      break;
    // do nothing
    default:
      changes = changes.concat(comparePrimitives(oldObj, newObj, path));
  }

  return changes;
};

const compareObject = (oldObj: any, newObj: any, path: any, keyPath: any, skipPath = false, options: Options = {}) => {
  let k;
  let newKeyPath;
  let newPath;

  if (skipPath == null) {
    skipPath = false;
  }
  let changes: any[] = [];

  // Filter keys directly rather than filtering by keysToSkip at this level
  // The full path check is now done in the compare function
  const oldObjKeys = Object.keys(oldObj);
  const newObjKeys = Object.keys(newObj);

  const intersectionKeys = intersection(oldObjKeys, newObjKeys);
  for (k of intersectionKeys) {
    newPath = path.concat([k]);
    newKeyPath = skipPath ? keyPath : keyPath.concat([k]);
    if (!shouldComparePath(newKeyPath.join('.'), options)) continue;
    const diffs = compare(oldObj[k], newObj[k], newPath, newKeyPath, options);
    if (diffs.length) {
      changes = changes.concat(diffs);
    }
  }

  const addedKeys = difference(newObjKeys, oldObjKeys);
  for (k of addedKeys) {
    newPath = path.concat([k]);
    newKeyPath = skipPath ? keyPath : keyPath.concat([k]);
    // Check if the path should be skipped
    const currentPath = newKeyPath.join('.');
    if (!shouldComparePath(currentPath, options)) {
      continue; // Skip adding this key
    }
    changes.push({
      type: Operation.ADD,
      key: getKey(newPath),
      value: newObj[k]
    });
  }

  const deletedKeys = difference(oldObjKeys, newObjKeys);
  for (k of deletedKeys) {
    newPath = path.concat([k]);
    newKeyPath = skipPath ? keyPath : keyPath.concat([k]);
    // Check if the path should be skipped
    const currentPath = newKeyPath.join('.');
    if (!shouldComparePath(currentPath, options)) {
      continue; // Skip removing this key
    }
    changes.push({
      type: Operation.REMOVE,
      key: getKey(newPath),
      value: oldObj[k]
    });
  }
  return changes;
};

const compareArray = (oldObj: any, newObj: any, path: any, keyPath: any, options: Options) => {
  if (getTypeOfObj(newObj) !== 'Array') {
    return [{ type: Operation.UPDATE, key: getKey(path), value: newObj, oldValue: oldObj }];
  }

  const left = getObjectKey(options.embeddedObjKeys, keyPath);
  const uniqKey = left ?? '$index';
  const indexedOldObj = convertArrayToObj(oldObj, uniqKey);
  const indexedNewObj = convertArrayToObj(newObj, uniqKey);
  const diffs = compareObject(indexedOldObj, indexedNewObj, path, keyPath, true, options);
  const isFunctionKey = typeof uniqKey === 'function' && uniqKey.length === 2;
  if (diffs.length) {
    const resolvedKey = isFunctionKey ? uniqKey(newObj[0] ?? oldObj[0], true) : uniqKey;
    // Nested path when resolvedKey contains '.' and matches NESTED_PATH_RE.
    // Function keys qualify directly; string keys qualify only if the sample
    // element does not expose resolvedKey as a literal property.
    const sampleEl = newObj[0] ?? oldObj[0];
    const isNestedPath = typeof resolvedKey === 'string' && resolvedKey.includes('.') && NESTED_PATH_RE.test(resolvedKey)
      && (isFunctionKey || !(sampleEl != null && typeof sampleEl === 'object' && resolvedKey in sampleEl));
    return [
      {
        type: Operation.UPDATE,
        key: getKey(path),
        embeddedKey: resolvedKey,
        ...(isNestedPath ? { embeddedKeyIsPath: true } : {}),
        changes: diffs
      }
    ];
  } else {
    return [];
  }
};

const getObjectKey = (embeddedObjKeys: any, keyPath: any) => {
  if (embeddedObjKeys != null) {
    const path = keyPath.join('.');

    if (embeddedObjKeys instanceof Map) {
      for (const [key, value] of embeddedObjKeys.entries()) {
        if (key instanceof RegExp) {
          if (path.match(key)) {
            return value;
          }
        } else if (path === key) {
          return value;
        }
      }
    }

    const key = embeddedObjKeys[path];
    if (key != null) {
      return key;
    }
  }
  return undefined;
};

const convertArrayToObj = (arr: any[], uniqKey: any) => {
  let obj: any = {};
  if (uniqKey === '$value') {
    arr.forEach((value) => {
      obj[value] = value;
    });
  } else if (uniqKey === '$index') {
    for (let i = 0; i < arr.length; i++) {
      const value = arr[i];
      obj[i] = value;
    }
  } else {
    const maybeNestedPath = typeof uniqKey === 'string' && uniqKey.includes('.') && NESTED_PATH_RE.test(uniqKey);
    const keyFunction = typeof uniqKey === 'string'
      ? (maybeNestedPath
          ? (item: any) => (item != null && typeof item === 'object' && uniqKey in item) ? item[uniqKey] : resolveProperty(item, uniqKey, true)
          : (item: any) => item[uniqKey])
      : uniqKey;
    obj = keyBy(arr, keyFunction);
  }
  return obj;
};

const comparePrimitives = (oldObj: any, newObj: any, path: any) => {
  const changes = [];
  if (oldObj !== newObj) {
    changes.push({
      type: Operation.UPDATE,
      key: getKey(path),
      value: newObj,
      oldValue: oldObj
    });
  }
  return changes;
};

const removeKey = (obj: any, key: any, embeddedKey: any, isPath?: boolean) => {
  if (Array.isArray(obj)) {
    if (embeddedKey === '$index') {
      obj.splice(Number(key), 1);
      return;
    }
    const index = indexOfItemInArray(obj, embeddedKey, key, isPath);
    if (index === -1) {
      // tslint:disable-next-line:no-console
      console.warn(`Element with the key '${embeddedKey}' and value '${key}' could not be found in the array!`);
      return;
    }
    return obj.splice(index ?? key, 1);
  } else {
    delete obj[key];
    return;
  }
};

/** Resolve a property on an object. When isPath is true, traverses nested dot-separated segments. */
const resolveProperty = (obj: any, key: any, isPath?: boolean): any => {
  if (obj == null) return undefined;
  if (typeof key !== 'string' || !isPath || !key.includes('.')) return obj[key];
  return key.split('.').reduce((cur, seg) => cur?.[seg], obj);
};

const indexOfItemInArray = (arr: any[], key: any, value: any, isPath?: boolean) => {
  if (key === '$value') {
    return arr.indexOf(value);
  }
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item == null) continue;
    const resolved = resolveProperty(item, key, isPath);
    if (resolved !== undefined && String(resolved) === String(value)) {
      return i;
    }
  }
  return -1;
};

const modifyKeyValue = (obj: any, key: any, value: any) => (obj[key] = value);
const addKeyValue = (obj: any, key: any, value: any, embeddedKey?: any) => {
  if (Array.isArray(obj)) {
    if (embeddedKey === '$index') {
      obj.splice(Number(key), 0, value);
      return obj.length;
    }
    return obj.push(value);
  } else {
    return obj ? (obj[key] = value) : null;
  }
};

const applyLeafChange = (obj: any, change: any, embeddedKey: any, isPath?: boolean) => {
  const { type, key, value } = change;
  switch (type) {
    case Operation.ADD:
      return addKeyValue(obj, key, value, embeddedKey);
    case Operation.UPDATE:
      return modifyKeyValue(obj, key, value);
    case Operation.REMOVE:
      return removeKey(obj, key, embeddedKey, isPath);
  }
};

/**
 * Applies changes to an array.
 * 
 * @param {any[]} arr - The array to apply changes to.
 * @param {any} change - The change to apply, containing nested changes.
 * @returns {any[]} - The array after changes have been applied.
 *
 * Note: This function modifies the array in-place but also returns it for
 * consistency with other functions.
 */
const applyArrayChange = (arr: any[], change: any) => {
  let changes = change.changes;
  if (change.embeddedKey === '$index') {
    changes = [...changes].sort((a, b) => {
      if (a.type === Operation.REMOVE && b.type === Operation.REMOVE) {
        return Number(b.key) - Number(a.key);
      }
      if (a.type === Operation.REMOVE) return -1;
      if (b.type === Operation.REMOVE) return 1;
      return Number(a.key) - Number(b.key);
    });
  }

  for (const subchange of changes) {
    if (
      (subchange.value !== null && subchange.value !== undefined) ||
      subchange.type === Operation.REMOVE ||
      (subchange.value === null && subchange.type === Operation.ADD) ||
      (subchange.value === undefined && subchange.type === Operation.ADD)
    ) {
      applyLeafChange(arr, subchange, change.embeddedKey, change.embeddedKeyIsPath);
    } else {
      let element;
      if (change.embeddedKey === '$index') {
        element = arr[subchange.key];
      } else if (change.embeddedKey === '$value') {
        const index = arr.indexOf(subchange.key);
        if (index !== -1) {
          element = arr[index];
        }
      } else {
        element = arr.find((el) => {
          const resolved = resolveProperty(el, change.embeddedKey, change.embeddedKeyIsPath);
          return resolved !== undefined && String(resolved) === String(subchange.key);
        });
      }
      if (element) {
        applyChangeset(element, subchange.changes);
      }
    }
  }
  return arr;
};

const applyBranchChange = (obj: any, change: any) => {
  if (Array.isArray(obj)) {
    return applyArrayChange(obj, change);
  } else {
    return applyChangeset(obj, change.changes);
  }
};

const revertLeafChange = (obj: any, change: any, embeddedKey = '$index', isPath?: boolean) => {
  const { type, key, value, oldValue } = change;
  
  // Special handling for $root key
  if (key === '$root') {
    switch (type) {
      case Operation.ADD:
        // When reverting an ADD of the entire object, clear all properties
        for (const prop in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, prop)) {
            delete obj[prop];
          }
        }
        return obj;
      case Operation.UPDATE:
        // Replace the entire object with the old value
        for (const prop in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, prop)) {
            delete obj[prop];
          }
        }
        if (oldValue && typeof oldValue === 'object') {
          Object.assign(obj, oldValue);
        }
        return obj;
      case Operation.REMOVE:
        // Restore the removed object
        if (value && typeof value === 'object') {
          Object.assign(obj, value);
        }
        return obj;
    }
  }
  
  // Regular property handling
  switch (type) {
    case Operation.ADD:
      return removeKey(obj, key, embeddedKey, isPath);
    case Operation.UPDATE:
      return modifyKeyValue(obj, key, oldValue);
    case Operation.REMOVE:
      return addKeyValue(obj, key, value, embeddedKey);
  }
};

/**
 * Reverts changes in an array.
 * 
 * @param {any[]} arr - The array to revert changes in.
 * @param {any} change - The change to revert, containing nested changes.
 * @returns {any[]} - The array after changes have been reverted.
 *
 * Note: This function modifies the array in-place but also returns it for
 * consistency with other functions.
 */
const revertArrayChange = (arr: any[], change: any) => {
  let changes = change.changes;
  if (change.embeddedKey === '$index') {
    changes = [...changes].sort((a, b) => {
      if (a.type === Operation.ADD && b.type === Operation.ADD) {
        return Number(b.key) - Number(a.key);
      }
      if (a.type === Operation.ADD) return -1;
      if (b.type === Operation.ADD) return 1;
      return Number(a.key) - Number(b.key);
    });
  }

  for (const subchange of changes) {
    if (!subchange.changes) {
      revertLeafChange(arr, subchange, change.embeddedKey, change.embeddedKeyIsPath);
    } else {
      let element;
      if (change.embeddedKey === '$index') {
        element = arr[+subchange.key];
      } else if (change.embeddedKey === '$value') {
        const index = arr.indexOf(subchange.key);
        if (index !== -1) {
          element = arr[index];
        }
      } else {
        element = arr.find((el) => {
          const resolved = resolveProperty(el, change.embeddedKey, change.embeddedKeyIsPath);
          return resolved !== undefined && String(resolved) === String(subchange.key);
        });
      }
      if (element) {
        revertChangeset(element, subchange.changes);
      }
    }
  }
  return arr;
};

const revertBranchChange = (obj: any, change: any) => {
  if (Array.isArray(obj)) {
    return revertArrayChange(obj, change);
  } else {
    return revertChangeset(obj, change.changes);
  }
};

/** combine a base JSON Path with a subsequent segment */
function append(basePath: string, nextSegment: string): string {
  // Preserve legacy dotted-key paths, but quote keys that would be ambiguous
  // with array selectors or the bracket delimiter.
  if (!nextSegment || /[[\]'\\]/.test(nextSegment) || /^\d/.test(nextSegment)) {
    return `${basePath}['${nextSegment.replace(/'/g, "''")}']`;
  }
  return nextSegment.includes('.') ? `${basePath}[${nextSegment}]` : `${basePath}.${nextSegment}`;
}

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const NESTED_PATH_RE = /^[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;

/** returns a JSON Path filter expression; e.g., `$.pet[?(@.name=='spot')]` */
function filterExpression(basePath: string, filterKey: string, filterValue: string, isPath?: boolean) {
  const escapedValue = `'${filterValue.replace(/'/g, "''")}'`;
  let memberAccess: string;
  if (isPath && NESTED_PATH_RE.test(filterKey)) {
    // Nested path: use dot notation for each segment (e.g. @.a.b)
    memberAccess = '.' + filterKey;
  } else if (IDENT_RE.test(filterKey)) {
    memberAccess = `.${filterKey}`;
  } else {
    memberAccess = `['${filterKey.replace(/'/g, "''")}']`;
  }
  return `${basePath}[?(@${memberAccess}==${escapedValue})]`;
}

export {
  Changeset,
  EmbeddedObjKeysMapType,
  EmbeddedObjKeysType,
  IAtomicChange,
  IChange,
  Operation,
  Options,
  applyChangeset,
  atomizeChangeset,
  diff,
  getTypeOfObj,
  revertChangeset,
  unatomizeChangeset
};
