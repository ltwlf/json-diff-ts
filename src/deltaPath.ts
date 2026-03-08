// ─── Segment Types ──────────────────────────────────────────────────────────

export type DeltaPathSegment =
  | { type: 'root' }
  | { type: 'property'; name: string }
  | { type: 'index'; index: number }
  | { type: 'keyFilter'; property: string; value: unknown }
  | { type: 'valueFilter'; value: unknown };

// ─── Filter Literal Formatting ──────────────────────────────────────────────

/**
 * Format a value as a canonical JSON Delta filter literal.
 * Strings → single-quoted with doubled-quote escaping.
 * Numbers, booleans, null → plain JSON representation.
 */
export function formatFilterLiteral(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Cannot format non-finite number as filter literal: ${value}`);
    return String(value);
  }
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  throw new Error(`Cannot format filter literal for type ${typeof value}`);
}

/**
 * Parse a filter literal string into a typed JS value.
 * Reverse of formatFilterLiteral.
 */
export function parseFilterLiteral(s: string): unknown {
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null') return null;
  if (s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  // Number — only accept JSON-compatible numeric literals (decimal, optional sign, optional exponent)
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s)) {
    return Number(s);
  }
  throw new Error(`Invalid filter literal: ${s}`);
}

// ─── Quoted String Extraction ───────────────────────────────────────────────

/**
 * Extract a single-quoted string starting at index `start` (after the opening quote).
 * Returns [unescaped string, index of closing quote].
 */
function extractQuotedString(s: string, start: number): [string, number] {
  const result: string[] = [];
  let i = start;
  while (i < s.length) {
    if (s[i] === "'") {
      if (i + 1 < s.length && s[i + 1] === "'") {
        result.push("'");
        i += 2;
      } else {
        return [result.join(''), i];
      }
    } else {
      result.push(s[i]);
      i += 1;
    }
  }
  throw new Error('Unterminated quoted string');
}

// ─── Filter Closing Search ──────────────────────────────────────────────────

/**
 * Find the index of the closing `)]` for a filter expression starting at `from`,
 * skipping over single-quoted strings (with doubled-quote escaping).
 * Returns the index of `)` in `)]`, or -1 if not found.
 */
function findFilterClose(s: string, from: number): number {
  let i = from;
  while (i < s.length) {
    if (s[i] === "'") {
      // Skip single-quoted string
      i += 1;
      while (i < s.length) {
        if (s[i] === "'") {
          if (i + 1 < s.length && s[i + 1] === "'") {
            i += 2; // escaped quote
          } else {
            i += 1; // closing quote
            break;
          }
        } else {
          i += 1;
        }
      }
    } else if (s[i] === ')' && i + 1 < s.length && s[i + 1] === ']') {
      return i;
    } else {
      i += 1;
    }
  }
  return -1;
}

// ─── Filter Parsing ─────────────────────────────────────────────────────────

function parseFilter(inner: string): DeltaPathSegment {
  if (inner.startsWith("@.")) {
    // Key filter with dot property: @.key==val
    const eq = inner.indexOf('==');
    if (eq === -1) throw new Error(`Invalid filter: missing '==' in ${inner}`);
    const key = inner.slice(2, eq);
    return { type: 'keyFilter', property: key, value: parseFilterLiteral(inner.slice(eq + 2)) };
  }
  if (inner.startsWith("@['")) {
    // Key filter with bracket property: @['dotted.key']==val
    const [key, endIdx] = extractQuotedString(inner, 3);
    // endIdx is at closing quote; then ']', '=', '=' follow
    const valStart = endIdx + 4; // skip past ']==
    return { type: 'keyFilter', property: key, value: parseFilterLiteral(inner.slice(valStart)) };
  }
  if (inner.startsWith('@==')) {
    // Value filter: @==val
    return { type: 'valueFilter', value: parseFilterLiteral(inner.slice(3)) };
  }
  throw new Error(`Invalid filter expression: ${inner}`);
}

// ─── Path Parsing ───────────────────────────────────────────────────────────

/**
 * Parse a JSON Delta Path string into an array of typed segments.
 * Follows the grammar from the JSON Delta spec Section 5.1.
 */
export function parseDeltaPath(path: string): DeltaPathSegment[] {
  if (!path.startsWith('$')) {
    throw new Error(`Path must start with '$': ${path}`);
  }

  const segments: DeltaPathSegment[] = [{ type: 'root' }];
  let i = 1;

  while (i < path.length) {
    if (path[i] === '.') {
      // Dot property
      i += 1;
      const start = i;
      while (i < path.length && /[a-zA-Z0-9_]/.test(path[i])) {
        i += 1;
      }
      if (i === start) throw new Error(`Empty property name at position ${i} in: ${path}`);
      segments.push({ type: 'property', name: path.slice(start, i) });
    } else if (path[i] === '[') {
      if (i + 1 >= path.length) throw new Error(`Unexpected end of path after '[': ${path}`);

      if (path[i + 1] === '?') {
        // Filter expression: [?(@...==...)]
        const closingIdx = findFilterClose(path, i + 2);
        if (closingIdx === -1) throw new Error(`Unterminated filter expression in: ${path}`);
        const inner = path.slice(i + 3, closingIdx); // strip "[?(" ... ")"
        segments.push(parseFilter(inner));
        i = closingIdx + 2;
      } else if (path[i + 1] === "'") {
        // Bracket property: ['key']
        const [key, endIdx] = extractQuotedString(path, i + 2);
        // path[endIdx] is closing quote, next should be ']'
        if (path[endIdx + 1] !== ']') throw new Error(`Expected ']' after bracket property in: ${path}`);
        segments.push({ type: 'property', name: key });
        i = endIdx + 2;
      } else if (/\d/.test(path[i + 1])) {
        // Array index: [0]
        const end = path.indexOf(']', i);
        if (end === -1) throw new Error(`Unterminated array index in: ${path}`);
        const indexStr = path.slice(i + 1, end);
        // Validate: no leading zeros except for "0" itself
        if (indexStr.length > 1 && indexStr[0] === '0') {
          throw new Error(`Leading zeros not allowed in array index: [${indexStr}]`);
        }
        segments.push({ type: 'index', index: Number(indexStr) });
        i = end + 1;
      } else {
        throw new Error(`Unexpected character after '[': '${path[i + 1]}' in: ${path}`);
      }
    } else {
      throw new Error(`Unexpected character '${path[i]}' at position ${i} in: ${path}`);
    }
  }

  return segments;
}

// ─── Path Building ──────────────────────────────────────────────────────────

const SIMPLE_PROPERTY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function formatMemberAccess(name: string): string {
  if (SIMPLE_PROPERTY_RE.test(name)) {
    return `.${name}`;
  }
  return `['${name.replace(/'/g, "''")}']`;
}

/**
 * Build a canonical JSON Delta Path string from an array of segments.
 */
export function buildDeltaPath(segments: DeltaPathSegment[]): string {
  let result = '';
  for (const seg of segments) {
    switch (seg.type) {
      case 'root':
        result += '$';
        break;
      case 'property':
        result += formatMemberAccess(seg.name);
        break;
      case 'index':
        result += `[${seg.index}]`;
        break;
      case 'keyFilter': {
        const memberAccess = SIMPLE_PROPERTY_RE.test(seg.property)
          ? `.${seg.property}`
          : `['${seg.property.replace(/'/g, "''")}']`;
        result += `[?(@${memberAccess}==${formatFilterLiteral(seg.value)})]`;
        break;
      }
      case 'valueFilter':
        result += `[?(@==${formatFilterLiteral(seg.value)})]`;
        break;
    }
  }
  return result;
}

// ─── Path Conversion Utilities ──────────────────────────────────────────────

/**
 * Convert an internal atomic path (v4 format) to a canonical JSON Delta path.
 *
 * Transformations:
 * - `$.$root` → `$`
 * - Unquoted bracket properties `$[a.b]` → quoted `$['a.b']`
 * - Filter literals stay as-is (v4 always uses string-quoted)
 */
export function atomicPathToDeltaPath(atomicPath: string): string {
  // Handle root sentinel
  if (atomicPath === '$.$root') return '$';
  if (atomicPath.startsWith('$.$root.')) return '$' + atomicPath.slice(7);

  if (!atomicPath.startsWith('$')) {
    throw new Error(`Atomic path must start with '$': ${atomicPath}`);
  }

  let result = '$';
  let i = 1;

  while (i < atomicPath.length) {
    if (atomicPath[i] === '.') {
      // Dot property
      i += 1;
      const start = i;
      while (i < atomicPath.length && atomicPath[i] !== '.' && atomicPath[i] !== '[') {
        i += 1;
      }
      const name = atomicPath.slice(start, i);
      result += formatMemberAccess(name);
    } else if (atomicPath[i] === '[') {
      if (atomicPath[i + 1] === '?') {
        // Filter expression — pass through as-is until ')]'
        const closingIdx = findFilterClose(atomicPath, i + 2);
        if (closingIdx === -1) throw new Error(`Unterminated filter in: ${atomicPath}`);
        result += atomicPath.slice(i, closingIdx + 2);
        i = closingIdx + 2;
      } else if (atomicPath[i + 1] === "'" || /\d/.test(atomicPath[i + 1])) {
        // Already bracket-quoted property or array index — pass through
        const end = atomicPath.indexOf(']', i);
        if (end === -1) throw new Error(`Unterminated bracket in: ${atomicPath}`);
        result += atomicPath.slice(i, end + 1);
        i = end + 1;
      } else {
        // Unquoted bracket property: [a.b] → ['a.b']
        const end = atomicPath.indexOf(']', i);
        if (end === -1) throw new Error(`Unterminated bracket in: ${atomicPath}`);
        const name = atomicPath.slice(i + 1, end);
        result += `['${name.replace(/'/g, "''")}']`;
        i = end + 1;
      }
    } else {
      throw new Error(`Unexpected character '${atomicPath[i]}' in atomic path: ${atomicPath}`);
    }
  }

  return result;
}

/**
 * Convert a JSON Delta path to an internal atomic path (v4 format).
 *
 * Transformations:
 * - `$` (root-only) → `$.$root` with key `$root`
 * - Bracket-quoted properties `$['a.b']` → unquoted `$[a.b]`
 * - Non-string filter literals re-quoted to strings: `[?(@.id==42)]` → `[?(@.id=='42')]`
 */
export function deltaPathToAtomicPath(deltaPath: string): string {
  if (!deltaPath.startsWith('$')) {
    throw new Error(`Delta path must start with '$': ${deltaPath}`);
  }

  // Root-only path
  if (deltaPath === '$') {
    return '$.$root';
  }

  let result = '$';
  let i = 1;

  while (i < deltaPath.length) {
    if (deltaPath[i] === '.') {
      // Dot property — pass through
      i += 1;
      const start = i;
      while (i < deltaPath.length && /[a-zA-Z0-9_]/.test(deltaPath[i])) {
        i += 1;
      }
      result += '.' + deltaPath.slice(start, i);
    } else if (deltaPath[i] === '[') {
      if (deltaPath[i + 1] === '?') {
        // Filter expression — need to re-quote non-string literals to strings
        const closingIdx = findFilterClose(deltaPath, i + 2);
        if (closingIdx === -1) throw new Error(`Unterminated filter in: ${deltaPath}`);
        const filterContent = deltaPath.slice(i, closingIdx + 2);
        result += normalizeFilterToStringLiterals(filterContent);
        i = closingIdx + 2;
      } else if (deltaPath[i + 1] === "'") {
        // Bracket-quoted property: ['a.b'] → [a.b]
        const [key, endIdx] = extractQuotedString(deltaPath, i + 2);
        if (deltaPath[endIdx + 1] !== ']') throw new Error(`Expected ']' in: ${deltaPath}`);
        result += `[${key}]`;
        i = endIdx + 2;
      } else if (/\d/.test(deltaPath[i + 1])) {
        // Array index — pass through
        const end = deltaPath.indexOf(']', i);
        if (end === -1) throw new Error(`Unterminated bracket in: ${deltaPath}`);
        result += deltaPath.slice(i, end + 1);
        i = end + 1;
      } else {
        throw new Error(`Unexpected character after '[' in: ${deltaPath}`);
      }
    } else {
      throw new Error(`Unexpected character '${deltaPath[i]}' in delta path: ${deltaPath}`);
    }
  }

  return result;
}

/**
 * Normalize filter expression to use string-quoted literals for all values.
 * This makes the path compatible with v4 unatomizeChangeset regex.
 *
 * Examples:
 * - `[?(@.id==42)]` → `[?(@.id=='42')]`
 * - `[?(@.id=='42')]` → unchanged
 * - `[?(@==true)]` → `[?(@=='true')]`
 * - `[?(@.id==null)]` → `[?(@.id=='null')]`
 */
function normalizeFilterToStringLiterals(filter: string): string {
  // Match the filter structure to find the literal value part
  // Key filter with dot property: [?(@.key==val)]
  // Key filter with bracket property: [?(@['key']==val)]
  // Value filter: [?(@==val)]

  const eqIdx = filter.indexOf('==');
  if (eqIdx === -1) return filter;

  // Find where the literal starts (after '==') and ends (before ')]')
  const literalStart = eqIdx + 2;
  const literalEnd = filter.length - 2; // before ')]'
  const literal = filter.slice(literalStart, literalEnd);

  // If already string-quoted, pass through
  if (literal.startsWith("'") && literal.endsWith("'")) {
    return filter;
  }

  // Parse the literal and re-quote as string
  const value = parseFilterLiteral(literal);
  const stringValue = String(value).replace(/'/g, "''");

  return filter.slice(0, literalStart) + `'${stringValue}'` + filter.slice(literalEnd);
}

// ─── Key Extraction ─────────────────────────────────────────────────────────

/**
 * Extract the key (last segment identifier) from an atomic-format path.
 * Used by `fromDelta` to populate the `key` field of IAtomicChange.
 */
export function extractKeyFromAtomicPath(atomicPath: string): string {
  // Walk backwards to find the last segment
  if (atomicPath === '$.$root') return '$root';

  // Check for filter at the end: ...)]
  if (atomicPath.endsWith(')]')) {
    // Find the matching [?( for the last filter
    const filterStart = atomicPath.lastIndexOf('[?(');
    if (filterStart !== -1) {
      // The key is the filter key value (the changeset key used for lookup)
      const inner = atomicPath.slice(filterStart + 3, atomicPath.length - 2);
      // Parse filter to get the value
      if (inner.startsWith('@==')) {
        // Value filter: the key is the literal value as string
        const val = parseFilterLiteral(inner.slice(3));
        return String(val);
      }
      // Key filter: @.key==val or @['key']==val
      const eqIdx = inner.indexOf('==');
      if (eqIdx !== -1) {
        const val = parseFilterLiteral(inner.slice(eqIdx + 2));
        return String(val);
      }
    }
  }

  // Check for array index at end: ...[N]
  if (atomicPath.endsWith(']')) {
    const bracketStart = atomicPath.lastIndexOf('[');
    if (bracketStart !== -1) {
      const inner = atomicPath.slice(bracketStart + 1, atomicPath.length - 1);
      // Numeric index
      if (/^\d+$/.test(inner)) return inner;
      // Bracket property
      return inner;
    }
  }

  // Dot property: last segment after last unbracketed dot
  const lastDot = atomicPath.lastIndexOf('.');
  if (lastDot > 0) {
    return atomicPath.slice(lastDot + 1);
  }

  return atomicPath;
}
