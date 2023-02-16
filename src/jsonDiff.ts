import { difference, find, intersection, keyBy } from 'lodash-es';

interface Dictionary<T> {
  [index: string]: T;
}

type FunctionKey = (obj: any, getKeyName?: boolean) => any;

export const getTypeOfObj = (obj: any) => {
  if (typeof obj === 'undefined') {
    return 'undefined';
  }

  if (obj === null) {
    return null;
  }

  return Object.prototype.toString.call(obj).match(/^\[object\s(.*)\]$/)[1];
};

const getKey = (path: string) => {
  const left = path[path.length - 1];
  return left != null ? left : '$root';
};

const compare = (oldObj: any, newObj: any, path: any, embeddedObjKeys: any, keyPath: any) => {
  let changes: any[] = [];

  const typeOfOldObj = getTypeOfObj(oldObj);

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
      const diffs = compareObject(oldObj, newObj, path, embeddedObjKeys, keyPath);
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
      changes = changes.concat(compareArray(oldObj, newObj, path, embeddedObjKeys, keyPath));
      break;
    case 'Function':
      break;
    // do nothing
    default:
      changes = changes.concat(comparePrimitives(oldObj, newObj, path));
  }

  return changes;
};

const compareObject = (oldObj: any, newObj: any, path: any, embeddedObjKeys: any, keyPath: any, skipPath = false) => {
  let k;
  let newKeyPath;
  let newPath;

  if (skipPath == null) {
    skipPath = false;
  }
  let changes: any[] = [];

  const oldObjKeys = Object.keys(oldObj);
  const newObjKeys = Object.keys(newObj);

  const intersectionKeys = intersection(oldObjKeys, newObjKeys);
  for (k of intersectionKeys) {
    newPath = path.concat([k]);
    newKeyPath = skipPath ? keyPath : keyPath.concat([k]);
    const diffs = compare(oldObj[k], newObj[k], newPath, embeddedObjKeys, newKeyPath);
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

const compareArray = (oldObj: any, newObj: any, path: any, embeddedObjKeys: any, keyPath: any) => {
  const left = getObjectKey(embeddedObjKeys, keyPath);
  const uniqKey = left != null ? left : '$index';
  const indexedOldObj = convertArrayToObj(oldObj, uniqKey);
  const indexedNewObj = convertArrayToObj(newObj, uniqKey);
  const diffs = compareObject(indexedOldObj, indexedNewObj, path, embeddedObjKeys, keyPath, true);
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
    const key = embeddedObjKeys[path];
    if (key != null) {
      return key;
    }
    for (const regex in embeddedObjKeys) {
      if (path.match(new RegExp(regex))) {
        return embeddedObjKeys[regex];
      }
    }
  }
  return undefined;
};

const convertArrayToObj = (arr: any[], uniqKey: any) => {
  let obj: any = {};
  if (uniqKey !== '$index') {
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

// const isEmbeddedKey = key => /\$.*=/gi.test(key)

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
        } else {
          element = find(arr, (el) => el[change.embeddedKey].toString() === subchange.key.toString());
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

export const diff = (oldObj: any, newObj: any, embeddedObjKeys?: Dictionary<string | FunctionKey>): IChange[] =>
  compare(oldObj, newObj, [], embeddedObjKeys, []);

export const applyChangeset = (obj: any, changeset: Changeset) => {
  if (changeset) {
    changeset.forEach((change) =>
      (change.value !== null && change.value !== undefined) || change.type === Operation.REMOVE
        ? applyLeafChange(obj, change, change.embeddedKey)
        : applyBranchChange(obj[change.key], change)
    );
  }

  return obj;
};

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

export const flattenChangeset = (
  obj: Changeset | IChange,
  path = '$',
  embeddedKey?: string | FunctionKey
): IFlatChange[] => {
  if (Array.isArray(obj)) {
    return obj.reduce((memo, change) => [...memo, ...flattenChangeset(change, path, embeddedKey)], [] as IFlatChange[]);
  } else {
    if (obj.changes || embeddedKey) {
      path = embeddedKey
        ? embeddedKey === '$index'
          ? `${path}[${obj.key}]`
          : obj.type === Operation.ADD
          ? path
          : `${path}[?(@.${embeddedKey}='${obj.key}')]`
        : (path = `${path}.${obj.key}`);
      return flattenChangeset(obj.changes || obj, path, obj.embeddedKey);
    } else {
      const valueType = getTypeOfObj(obj.value);
      return [
        {
          ...obj,
          path: valueType === 'Object' || path.endsWith(`[${obj.key}]`) ? path : `${path}.${obj.key}`,
          valueType
        }
      ];
    }
  }
};

export const unflattenChanges = (changes: IFlatChange | IFlatChange[]) => {
  if (!Array.isArray(changes)) {
    changes = [changes];
  }

  const changesArr: IChange[] = [];

  changes.forEach((change) => {
    const obj = {} as IChange;
    let ptr = obj;

    const segments = change.path.split(/([^@])\./).reduce((acc, curr, i) => {
      const x = Math.floor(i / 2);
      if (!acc[x]) {
        acc[x] = '';
      }
      acc[x] += curr;
      return acc;
    }, []);
    // $.childern[@.name='chris'].age
    // =>
    // $
    // childern[@.name='chris']
    // age

    if (segments.length === 1) {
      ptr.key = change.key;
      ptr.type = change.type;
      ptr.value = change.value;
      ptr.oldValue = change.oldValue;
      changesArr.push(ptr);
    } else {
      for (let i = 1; i < segments.length; i++) {
        const segment = segments[i];
        // check for array
        const result = /^(.+)\[\?\(@\.(.+)='(.+)'\)]$|^(.+)\[(\d+)\]/.exec(segment);
        // array
        if (result) {
          let key: string;
          let embeddedKey: string;
          let arrKey: string | number;
          if (result[1]) {
            key = result[1];
            embeddedKey = result[2];
            arrKey = result[3];
          } else {
            key = result[4];
            embeddedKey = '$index';
            arrKey = Number(result[5]);
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
