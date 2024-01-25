import { difference, find, intersection, keyBy } from 'lodash-es';

type FunctionKey = (obj: any, shouldReturnKeyName?: boolean) => any;
export type EmbeddedObjKeysType = Record<string, string | FunctionKey>;
export type EmbeddedObjKeysMapType = Map<string | RegExp, string | FunctionKey>;
export enum Operation {
  REMOVE = 'REMOVE',
  ADD = 'ADD',
  UPDATE = 'UPDATE'
}

export interface IChange {
  type: Operation;
  key: string;
  embeddedKey?: string | FunctionKey;
  value?: any | any[];
  oldValue?: any;
  changes?: IChange[];
}
export type Changeset = IChange[];

export interface IFlatChange {
  type: Operation;
  key: string;
  path: string;
  valueType: string | null;
  value?: any;
  oldValue?: any;
}

/**
 * Computes the difference between two objects.
 *
 * @param {any} oldObj - The original object.
 * @param {any} newObj - The updated object.
 * @param {EmbeddedObjKeysType | EmbeddedObjKeysMapType} embeddedObjKeys - An optional parameter specifying keys of embedded objects.
 * @returns {IChange[]} - An array of changes that transform the old object into the new object.
 */
export function diff(
  oldObj: any,
  newObj: any,
  embeddedObjKeys?: EmbeddedObjKeysType | EmbeddedObjKeysMapType,
  keysToSkip?: string[]
): IChange[] {
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
  return compare(oldObj, newObj, [], embeddedObjKeys, [], keysToSkip);
}

/**
 * Applies all changes in the changeset to the object.
 *
 * @param {any} obj - The object to apply changes to.
 * @param {Changeset} changeset - The changeset to apply.
 * @returns {any} - The object after the changes from the changeset have been applied.
 *
 * The function first checks if a changeset is provided. If so, it iterates over each change in the changeset.
 * If the change value is not null or undefined, or if the change type is REMOVE, it applies the change to the object directly.
 * Otherwise, it applies the change to the corresponding branch of the object.
 */
export const applyChangeset = (obj: any, changeset: Changeset) => {
  if (changeset) {
    changeset.forEach((change) => {
      const { type, key, value, embeddedKey } = change;

      if ((value !== null && value !== undefined) || type === Operation.REMOVE) {
        // Apply the change to the object
        applyLeafChange(obj, change, embeddedKey);
      } else {
        // Apply the change to the branch
        applyBranchChange(obj[key], change);
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
 * It then iterates over each change in the changeset. If the change does not have any nested changes, it reverts the change on the object directly.
 * If the change does have nested changes, it reverts the changes on the corresponding branch of the object.
 */
export const revertChangeset = (obj: any, changeset: Changeset) => {
  if (changeset) {
    changeset
      .reverse()
      .forEach((change: IChange): any =>
        !change.changes ? revertLeafChange(obj, change) : revertBranchChange(obj[change.key], change)
      );
  }

  return obj;
};

/**
 * Flattens a changeset into an array of flat changes.
 *
 * @param {Changeset | IChange} obj - The changeset or change to flatten.
 * @param {string} [path='$'] - The current path in the changeset.
 * @param {string | FunctionKey} [embeddedKey] - The key to use for embedded objects.
 * @returns {IFlatChange[]} - An array of flat changes.
 *
 * The function first checks if the input is an array. If so, it recursively flattens each change in the array.
 * If the input is not an array, it checks if the change has nested changes or an embedded key.
 * If so, it updates the path and recursively flattens the nested changes or the embedded object.
 * If the change does not have nested changes or an embedded key, it creates a flat change and returns it in an array.
 */
export const flattenChangeset = (
  obj: Changeset | IChange,
  path = '$',
  embeddedKey?: string | FunctionKey
): IFlatChange[] => {
  if (Array.isArray(obj)) {
    return obj.reduce((memo, change) => [...memo, ...flattenChangeset(change, path, embeddedKey)], [] as IFlatChange[]);
  } else {
    if (obj.changes || embeddedKey) {
      if (embeddedKey) {
        if (embeddedKey === '$index') {
          path = `${path}[${obj.key}]`;
        } else if (embeddedKey === '$value') {
          path = `${path}[?(@='${obj.key}')]`;
          const valueType = getTypeOfObj(obj.value);
          return [
            {
              ...obj,
              path,
              valueType
            }
          ];
        } else if (obj.type === Operation.ADD) {
          // do nothing
        } else {
          path = filterExpression(path, embeddedKey, obj.key);
        }
      } else {
        path = append(path, obj.key);
      }

      return flattenChangeset(obj.changes || obj, path, obj.embeddedKey);
    } else {
      const valueType = getTypeOfObj(obj.value);
      return [
        {
          ...obj,
          path: valueType === 'Object' || path.endsWith(`[${obj.key}]`) ? path : append(path, obj.key),
          valueType
        }
      ];
    }
  }
};

/**
 * Transforms a flat changeset into a nested changeset.
 *
 * @param {IFlatChange | IFlatChange[]} changes - The flat changeset to unflatten.
 * @returns {IChange[]} - The unflattened changeset.
 *
 * The function first checks if the input is a single change or an array of changes.
 * It then iterates over each change and splits its path into segments.
 * For each segment, it checks if it represents an array or a leaf node.
 * If it represents an array, it creates a new change object and updates the pointer to this new object.
 * If it represents a leaf node, it sets the key, type, value, and oldValue of the current change object.
 * Finally, it pushes the unflattened change object into the changes array.
 */
export const unflattenChanges = (changes: IFlatChange | IFlatChange[]) => {
  if (!Array.isArray(changes)) {
    changes = [changes];
  }

  const changesArr: IChange[] = [];

  changes.forEach((change) => {
    const obj = {} as IChange;
    let ptr = obj;

    const segments = change.path.split(/\.(?=[^\]]*(?:\[|$))/);

    if (segments.length === 1) {
      ptr.key = change.key;
      ptr.type = change.type;
      ptr.value = change.value;
      ptr.oldValue = change.oldValue;
      changesArr.push(ptr);
    } else {
      for (let i = 1; i < segments.length; i++) {
        const segment = segments[i];
        // Matches JSONPath segments: "items[?(@.id=='123')]", "items[?(@.id==123)]", "items[2]", "items[?(@='123')]"
        const result = /^(.+?)\[\?\(@.?(?:([^=]*))?={1,2}'(.*)'\)\]$|^(.+?)\[(\d+)\]$/.exec(segment); //NOSONAR
        // array
        if (result) {
          let key: string;
          let embeddedKey: string;
          let arrKey: string | number;
          if (result[1]) {
            key = result[1];
            embeddedKey = result[2] || '$value';
            arrKey = result[3];
          } else {
            key = result[4];
            embeddedKey = '$index';
            arrKey = Number(result[4]);
          }
          // leaf
          if (i === segments.length - 1) {
            ptr.key = key!;
            ptr.embeddedKey = embeddedKey!;
            ptr.type = Operation.UPDATE;
            ptr.changes = [
              {
                type: change.type,
                key: arrKey!,
                value: change.value,
                oldValue: change.oldValue
              } as IChange
            ];
          } else {
            // object
            ptr.key = key;
            ptr.embeddedKey = embeddedKey;
            ptr.type = Operation.UPDATE;
            const newPtr = {} as IChange;
            ptr.changes = [
              {
                type: Operation.UPDATE,
                key: arrKey,
                changes: [newPtr]
              } as IChange
            ];
            ptr = newPtr;
          }
        } else {
          // leaf
          if (i === segments.length - 1) {
            // check if value is a primitive or object
            if (change.value !== null && change.valueType === 'Object') {
              ptr.key = segment;
              ptr.type = Operation.UPDATE;
              ptr.changes = [
                {
                  key: change.key,
                  type: change.type,
                  value: change.value
                } as IChange
              ];
            } else {
              ptr.key = change.key;
              ptr.type = change.type;
              ptr.value = change.value;
              ptr.oldValue = change.oldValue;
            }
          } else {
            // branch
            ptr.key = segment;
            ptr.type = Operation.UPDATE;
            const newPtr = {} as IChange;
            ptr.changes = [newPtr];
            ptr = newPtr;
          }
        }
      }
      changesArr.push(obj);
    }
  });
  return changesArr;
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
export const getTypeOfObj = (obj: any) => {
  if (typeof obj === 'undefined') {
    return 'undefined';
  }

  if (obj === null) {
    return null;
  }

  // Extracts the "Type" from "[object Type]" string.
  return Object.prototype.toString.call(obj).match(/^\[object\s(.*)\]$/)[1];
};

const getKey = (path: string) => {
  const left = path[path.length - 1];
  return left != null ? left : '$root';
};

const compare = (oldObj: any, newObj: any, path: any, embeddedObjKeys: any, keyPath: any, keysToSkip: string[]) => {
  let changes: any[] = [];

  const typeOfOldObj = getTypeOfObj(oldObj);
  const typeOfNewObj = getTypeOfObj(newObj);

  // if type of object changes, consider it as old obj has been deleted and a new object has been added
  if (typeOfOldObj !== typeOfNewObj) {
    changes.push({ type: Operation.REMOVE, key: getKey(path), value: oldObj });
    changes.push({ type: Operation.ADD, key: getKey(path), value: newObj });
    return changes;
  }

  switch (typeOfOldObj) {
    case 'Date':
      changes = changes.concat(
        comparePrimitives(oldObj.getTime(), newObj.getTime(), path).map((x) => ({
          ...x,
          value: new Date(x.value),
          oldValue: new Date(x.oldValue)
        }))
      );
      break;
    case 'Object':
      const diffs = compareObject(oldObj, newObj, path, embeddedObjKeys, keyPath, false, keysToSkip);
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
    case 'Array':
      changes = changes.concat(compareArray(oldObj, newObj, path, embeddedObjKeys, keyPath, keysToSkip));
      break;
    case 'Function':
      break;
    // do nothing
    default:
      changes = changes.concat(comparePrimitives(oldObj, newObj, path));
  }

  return changes;
};

const compareObject = (
  oldObj: any,
  newObj: any,
  path: any,
  embeddedObjKeys: any,
  keyPath: any,
  skipPath = false,
  keysToSkip: string[] = []
) => {
  let k;
  let newKeyPath;
  let newPath;

  if (skipPath == null) {
    skipPath = false;
  }
  let changes: any[] = [];

  const oldObjKeys = Object.keys(oldObj).filter((key) => keysToSkip.indexOf(key) === -1);
  const newObjKeys = Object.keys(newObj).filter((key) => keysToSkip.indexOf(key) === -1);

  const intersectionKeys = intersection(oldObjKeys, newObjKeys);
  for (k of intersectionKeys) {
    newPath = path.concat([k]);
    newKeyPath = skipPath ? keyPath : keyPath.concat([k]);
    const diffs = compare(oldObj[k], newObj[k], newPath, embeddedObjKeys, newKeyPath, keysToSkip);
    if (diffs.length) {
      changes = changes.concat(diffs);
    }
  }

  const addedKeys = difference(newObjKeys, oldObjKeys);
  for (k of addedKeys) {
    newPath = path.concat([k]);
    newKeyPath = skipPath ? keyPath : keyPath.concat([k]);
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
    changes.push({
      type: Operation.REMOVE,
      key: getKey(newPath),
      value: oldObj[k]
    });
  }
  return changes;
};

const compareArray = (
  oldObj: any,
  newObj: any,
  path: any,
  embeddedObjKeys: any,
  keyPath: any,
  keysToSkip: string[]
) => {
  const left = getObjectKey(embeddedObjKeys, keyPath);
  const uniqKey = left != null ? left : '$index';
  const indexedOldObj = convertArrayToObj(oldObj, uniqKey);
  const indexedNewObj = convertArrayToObj(newObj, uniqKey);
  const diffs = compareObject(indexedOldObj, indexedNewObj, path, embeddedObjKeys, keyPath, true, keysToSkip);
  if (diffs.length) {
    return [
      {
        type: Operation.UPDATE,
        key: getKey(path),
        embeddedKey: typeof uniqKey === 'function' && uniqKey.length === 2 ? uniqKey(newObj[0], true) : uniqKey,
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
  } else if (uniqKey !== '$index') {
    obj = keyBy(arr, uniqKey);
  } else {
    for (let i = 0; i < arr.length; i++) {
      const value = arr[i];
      obj[i] = value;
    }
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

const removeKey = (obj: any, key: any, embeddedKey: any) => {
  if (Array.isArray(obj)) {
    if (embeddedKey === '$index') {
      obj.splice(key);
      return;
    }
    const index = indexOfItemInArray(obj, embeddedKey, key);
    if (index === -1) {
      // tslint:disable-next-line:no-console
      console.warn(`Element with the key '${embeddedKey}' and value '${key}' could not be found in the array'`);
      return;
    }
    return obj.splice(index != null ? index : key, 1);
  } else {
    obj[key] = undefined;
    delete obj[key];
    return;
  }
};

const indexOfItemInArray = (arr: any[], key: any, value: any) => {
  if (key === '$value') {
    return arr.indexOf(value);
  }
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item && item[key] ? item[key].toString() === value.toString() : undefined) {
      return i;
    }
  }
  return -1;
};

const modifyKeyValue = (obj: any, key: any, value: any) => (obj[key] = value);

const addKeyValue = (obj: any, key: any, value: any) => {
  if (Array.isArray(obj)) {
    return obj.push(value);
  } else {
    return obj ? (obj[key] = value) : null;
  }
};

const applyLeafChange = (obj: any, change: any, embeddedKey: any) => {
  const { type, key, value } = change;
  switch (type) {
    case Operation.ADD:
      return addKeyValue(obj, key, value);
    case Operation.UPDATE:
      return modifyKeyValue(obj, key, value);
    case Operation.REMOVE:
      return removeKey(obj, key, embeddedKey);
  }
};

const applyArrayChange = (arr: any, change: any) =>
  (() => {
    const result = [];
    for (const subchange of change.changes) {
      if (subchange.value != null || subchange.type === Operation.REMOVE) {
        result.push(applyLeafChange(arr, subchange, change.embeddedKey));
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
          element = find(arr, (el) => el[change.embeddedKey]?.toString() === subchange.key.toString());
        }
        result.push(applyChangeset(element, subchange.changes));
      }
    }
    return result;
  })();

const applyBranchChange = (obj: any, change: any) => {
  if (Array.isArray(obj)) {
    return applyArrayChange(obj, change);
  } else {
    return applyChangeset(obj, change.changes);
  }
};

const revertLeafChange = (obj: any, change: any, embeddedKey = '$index') => {
  const { type, key, value, oldValue } = change;
  switch (type) {
    case Operation.ADD:
      return removeKey(obj, key, embeddedKey);
    case Operation.UPDATE:
      return modifyKeyValue(obj, key, oldValue);
    case Operation.REMOVE:
      return addKeyValue(obj, key, value);
  }
};

const revertArrayChange = (arr: any, change: any) =>
  (() => {
    const result = [];
    for (const subchange of change.changes) {
      if (subchange.value != null || subchange.type === Operation.REMOVE) {
        result.push(revertLeafChange(arr, subchange, change.embeddedKey));
      } else {
        let element;
        if (change.embeddedKey === '$index') {
          element = arr[+subchange.key];
        } else {
          element = find(arr, (el) => el[change.embeddedKey].toString() === subchange.key);
        }
        result.push(revertChangeset(element, subchange.changes));
      }
    }
    return result;
  })();

const revertBranchChange = (obj: any, change: any) => {
  if (Array.isArray(obj)) {
    return revertArrayChange(obj, change);
  } else {
    return revertChangeset(obj, change.changes);
  }
};

/** combine a base JSON Path with a subsequent segment */
function append(basePath: string, nextSegment: string): string {
  return nextSegment.includes('.') ? `${basePath}[${nextSegment}]` : `${basePath}.${nextSegment}`;
}

/** returns a JSON Path filter expression; e.g., `$.pet[(?name='spot')]` */
function filterExpression(basePath: string, filterKey: string | FunctionKey, filterValue: string | number) {
  const value = typeof filterValue === 'number' ? filterValue : `'${filterValue}'`;
  return typeof filterKey === 'string' && filterKey.includes('.')
    ? `${basePath}[?(@[${filterKey}]==${value})]`
    : `${basePath}[?(@.${filterKey}==${value})]`;
}
