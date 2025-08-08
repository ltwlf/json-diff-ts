/* eslint-disable @typescript-eslint/no-explicit-any */

/* =======================
 * Types & Public Contracts
 * ======================= */

export type JsonKey = string | number;
export type FunctionKey = (obj: any, shouldReturnKeyName?: boolean) => any;

/**
 * How array elements are identified when diffing:
 * - '$index': use array index
 * - '$value': use primitive value (for string/number arrays)
 * - string   : property name to use as key (e.g. 'id')
 * - Function : custom resolver; when called with (x, true) should return the key name string
 */
export type EmbeddedKey = '$index' | '$value' | string | FunctionKey;

export type EmbeddedObjKeysType = Record<string, EmbeddedKey>;
export type EmbeddedObjKeysMapType = Map<string | RegExp, EmbeddedKey>;

export enum Operation {
  REMOVE = 'REMOVE',
  ADD = 'ADD',
  UPDATE = 'UPDATE',
  MOVE = 'MOVE'
}

export interface IChange {
  type: Operation;
  key: JsonKey;
  embeddedKey?: EmbeddedKey;
  value?: unknown;
  oldValue?: unknown;
  /** For MOVE operations - original position */
  oldIndex?: number;
  /** For MOVE operations - new position */
  newIndex?: number;
  changes?: Changeset;
}

export type Changeset = IChange[];

export interface IAtomicChange {
  type: Operation;
  key: JsonKey;
  path: string;
  valueType: string | null;
  value?: unknown;
  oldValue?: unknown;
  /** For MOVE operations - original position */
  oldIndex?: number;
  /** For MOVE operations - new position */
  newIndex?: number;
}

export interface Options {
  embeddedObjKeys?: EmbeddedObjKeysType | EmbeddedObjKeysMapType;
  /** Dotted paths to skip (skip path and all descendants). */
  keysToSkip?: readonly string[];
  /** When types differ between old/new, treat it as REMOVE + ADD (default: true). */
  treatTypeChangeAsReplace?: boolean;
  /** Detect array moves when an embedded key is available (default: false). */
  detectArrayMoves?: boolean;
}

/* =======================
 * Internal Types
 * ======================= */

export type KeySeg = JsonKey;

export interface NormalizedOptions {
  embeddedObjKeys: EmbeddedObjKeysType | EmbeddedObjKeysMapType | undefined;
  keysToSkip: readonly string[];
  treatTypeChangeAsReplace: boolean;
  detectArrayMoves: boolean;
}