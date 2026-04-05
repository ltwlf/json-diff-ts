import {
  parseAtomPath,
  buildAtomPath,
  formatFilterLiteral,
  parseFilterLiteral,
  atomicPathToAtomPath,
  atomPathToAtomicPath,
  extractKeyFromAtomicPath,
} from '../src/atomPath';

describe('formatFilterLiteral', () => {
  it('formats string values with single quotes', () => {
    expect(formatFilterLiteral('Alice')).toBe("'Alice'");
  });

  it('escapes single quotes by doubling', () => {
    expect(formatFilterLiteral("O'Brien")).toBe("'O''Brien'");
  });

  it('formats integers', () => {
    expect(formatFilterLiteral(42)).toBe('42');
  });

  it('formats negative numbers', () => {
    expect(formatFilterLiteral(-7)).toBe('-7');
  });

  it('formats floating point numbers', () => {
    expect(formatFilterLiteral(3.14)).toBe('3.14');
  });

  it('formats booleans', () => {
    expect(formatFilterLiteral(true)).toBe('true');
    expect(formatFilterLiteral(false)).toBe('false');
  });

  it('formats null', () => {
    expect(formatFilterLiteral(null)).toBe('null');
  });

  it('throws for unsupported types', () => {
    expect(() => formatFilterLiteral({})).toThrow();
    expect(() => formatFilterLiteral(undefined)).toThrow();
  });

  it('throws for NaN', () => {
    expect(() => formatFilterLiteral(NaN)).toThrow(/non-finite/);
  });

  it('throws for Infinity', () => {
    expect(() => formatFilterLiteral(Infinity)).toThrow(/non-finite/);
    expect(() => formatFilterLiteral(-Infinity)).toThrow(/non-finite/);
  });
});

describe('parseFilterLiteral', () => {
  it('parses single-quoted strings', () => {
    expect(parseFilterLiteral("'Alice'")).toBe('Alice');
  });

  it('unescapes doubled quotes', () => {
    expect(parseFilterLiteral("'O''Brien'")).toBe("O'Brien");
  });

  it('parses integers', () => {
    expect(parseFilterLiteral('42')).toBe(42);
  });

  it('parses negative numbers', () => {
    expect(parseFilterLiteral('-7')).toBe(-7);
  });

  it('parses floating point numbers', () => {
    expect(parseFilterLiteral('3.14')).toBe(3.14);
  });

  it('parses scientific notation', () => {
    expect(parseFilterLiteral('1e3')).toBe(1000);
    expect(parseFilterLiteral('1.5E-2')).toBe(0.015);
  });

  it('parses booleans', () => {
    expect(parseFilterLiteral('true')).toBe(true);
    expect(parseFilterLiteral('false')).toBe(false);
  });

  it('parses null', () => {
    expect(parseFilterLiteral('null')).toBe(null);
  });

  it('throws for invalid literals', () => {
    expect(() => parseFilterLiteral('abc')).toThrow();
  });

  it('rejects non-JSON numeric formats', () => {
    expect(() => parseFilterLiteral('')).toThrow();
    expect(() => parseFilterLiteral('0x10')).toThrow();
    expect(() => parseFilterLiteral('0o7')).toThrow();
    expect(() => parseFilterLiteral('0b101')).toThrow();
    expect(() => parseFilterLiteral(' ')).toThrow();
    expect(() => parseFilterLiteral('01')).toThrow(); // leading zero
  });

  it('round-trips with formatFilterLiteral', () => {
    const values: unknown[] = ['hello', "O'Brien", 42, -7, 3.14, true, false, null];
    for (const val of values) {
      expect(parseFilterLiteral(formatFilterLiteral(val))).toEqual(val);
    }
  });
});

describe('parseAtomPath', () => {
  it('parses root-only path', () => {
    expect(parseAtomPath('$')).toEqual([{ type: 'root' }]);
  });

  it('parses dot property', () => {
    expect(parseAtomPath('$.name')).toEqual([
      { type: 'root' },
      { type: 'property', name: 'name' },
    ]);
  });

  it('parses chained dot properties', () => {
    expect(parseAtomPath('$.user.address.city')).toEqual([
      { type: 'root' },
      { type: 'property', name: 'user' },
      { type: 'property', name: 'address' },
      { type: 'property', name: 'city' },
    ]);
  });

  it('parses bracket property', () => {
    expect(parseAtomPath("$['a.b']")).toEqual([
      { type: 'root' },
      { type: 'property', name: 'a.b' },
    ]);
  });

  it('parses bracket property with escaped quotes', () => {
    expect(parseAtomPath("$['O''Brien']")).toEqual([
      { type: 'root' },
      { type: 'property', name: "O'Brien" },
    ]);
  });

  it('parses array index', () => {
    expect(parseAtomPath('$.items[0]')).toEqual([
      { type: 'root' },
      { type: 'property', name: 'items' },
      { type: 'index', index: 0 },
    ]);
  });

  it('parses key filter with dot property and number', () => {
    expect(parseAtomPath('$.items[?(@.id==42)]')).toEqual([
      { type: 'root' },
      { type: 'property', name: 'items' },
      { type: 'keyFilter', property: 'id', value: 42 },
    ]);
  });

  it('parses key filter with string literal', () => {
    expect(parseAtomPath("$.items[?(@.name=='Widget')]")).toEqual([
      { type: 'root' },
      { type: 'property', name: 'items' },
      { type: 'keyFilter', property: 'name', value: 'Widget' },
    ]);
  });

  it('parses key filter with bracket property', () => {
    expect(parseAtomPath("$.items[?(@['a.b']==42)]")).toEqual([
      { type: 'root' },
      { type: 'property', name: 'items' },
      { type: 'keyFilter', property: 'a.b', value: 42, literalKey: true },
    ]);
  });

  it('parses key filter with boolean literal', () => {
    expect(parseAtomPath('$.items[?(@.active==true)]')).toEqual([
      { type: 'root' },
      { type: 'property', name: 'items' },
      { type: 'keyFilter', property: 'active', value: true },
    ]);
  });

  it('parses key filter with null literal', () => {
    expect(parseAtomPath('$.items[?(@.status==null)]')).toEqual([
      { type: 'root' },
      { type: 'property', name: 'items' },
      { type: 'keyFilter', property: 'status', value: null },
    ]);
  });

  it('parses value filter with string', () => {
    expect(parseAtomPath("$.tags[?(@=='urgent')]")).toEqual([
      { type: 'root' },
      { type: 'property', name: 'tags' },
      { type: 'valueFilter', value: 'urgent' },
    ]);
  });

  it('parses value filter with number', () => {
    expect(parseAtomPath('$.scores[?(@==100)]')).toEqual([
      { type: 'root' },
      { type: 'property', name: 'scores' },
      { type: 'valueFilter', value: 100 },
    ]);
  });

  it('parses deep path after key filter', () => {
    expect(parseAtomPath('$.items[?(@.id==1)].name')).toEqual([
      { type: 'root' },
      { type: 'property', name: 'items' },
      { type: 'keyFilter', property: 'id', value: 1 },
      { type: 'property', name: 'name' },
    ]);
  });

  it('parses non-canonical bracket-for-everything form', () => {
    expect(parseAtomPath("$['user']['name']")).toEqual([
      { type: 'root' },
      { type: 'property', name: 'user' },
      { type: 'property', name: 'name' },
    ]);
  });

  it('throws on invalid paths', () => {
    expect(() => parseAtomPath('')).toThrow();
    expect(() => parseAtomPath('name')).toThrow();
    expect(() => parseAtomPath('$[01]')).toThrow(); // leading zero
  });

  it('throws on unexpected character after [', () => {
    expect(() => parseAtomPath('$[!invalid]')).toThrow(/Unexpected character after/);
  });

  it('throws on unexpected character in path', () => {
    expect(() => parseAtomPath('$!name')).toThrow(/Unexpected character/);
  });

  it('throws on unterminated quoted string', () => {
    expect(() => parseAtomPath("$['unterminated")).toThrow(/Unterminated quoted string/);
  });

  it('throws on invalid filter expression', () => {
    expect(() => parseAtomPath('$[?(invalid==1)]')).toThrow(/Invalid filter expression/);
  });

  it('accepts nested dot-notation filter keys (RFC 9535)', () => {
    expect(parseAtomPath("$.items[?(@.pos.num==42)]")).toEqual([
      { type: 'root' },
      { type: 'property', name: 'items' },
      { type: 'keyFilter', property: 'pos.num', value: 42 },
    ]);
  });

  it('rejects invalid dot-notation filter keys', () => {
    expect(() => parseAtomPath("$.items[?(@.0key==42)]")).toThrow(/Invalid property name in filter/);
  });

  it('accepts bracket-notation filter keys with dots', () => {
    expect(parseAtomPath("$.items[?(@['pos.num']==42)]")).toEqual([
      { type: 'root' },
      { type: 'property', name: 'items' },
      { type: 'keyFilter', property: 'pos.num', value: 42, literalKey: true },
    ]);
  });

  it('handles filter literal containing )]', () => {
    const result = parseAtomPath("$.items[?(@.name=='val)]ue')]");
    expect(result).toEqual([
      { type: 'root' },
      { type: 'property', name: 'items' },
      { type: 'keyFilter', property: 'name', value: 'val)]ue' },
    ]);
  });
});

describe('buildAtomPath', () => {
  it('builds root-only path', () => {
    expect(buildAtomPath([{ type: 'root' }])).toBe('$');
  });

  it('builds simple dot property path', () => {
    expect(buildAtomPath([
      { type: 'root' },
      { type: 'property', name: 'user' },
      { type: 'property', name: 'name' },
    ])).toBe('$.user.name');
  });

  it('uses bracket notation for special property names', () => {
    expect(buildAtomPath([
      { type: 'root' },
      { type: 'property', name: 'a.b' },
    ])).toBe("$['a.b']");
  });

  it('uses bracket notation for properties starting with digits', () => {
    expect(buildAtomPath([
      { type: 'root' },
      { type: 'property', name: '0key' },
    ])).toBe("$['0key']");
  });

  it('builds array index', () => {
    expect(buildAtomPath([
      { type: 'root' },
      { type: 'property', name: 'items' },
      { type: 'index', index: 3 },
    ])).toBe('$.items[3]');
  });

  it('builds key filter with number', () => {
    expect(buildAtomPath([
      { type: 'root' },
      { type: 'property', name: 'items' },
      { type: 'keyFilter', property: 'id', value: 42 },
    ])).toBe('$.items[?(@.id==42)]');
  });

  it('builds key filter with string', () => {
    expect(buildAtomPath([
      { type: 'root' },
      { type: 'property', name: 'items' },
      { type: 'keyFilter', property: 'id', value: 'abc' },
    ])).toBe("$.items[?(@.id=='abc')]");
  });

  it('builds key filter with nested dot-notation property', () => {
    expect(buildAtomPath([
      { type: 'root' },
      { type: 'property', name: 'items' },
      { type: 'keyFilter', property: 'a.b', value: 42 },
    ])).toBe("$.items[?(@.a.b==42)]");
  });

  it('builds key filter with bracket-notation for non-identifier property', () => {
    expect(buildAtomPath([
      { type: 'root' },
      { type: 'property', name: 'items' },
      { type: 'keyFilter', property: 'a-b', value: 42 },
    ])).toBe("$.items[?(@['a-b']==42)]");
  });

  it('builds value filter', () => {
    expect(buildAtomPath([
      { type: 'root' },
      { type: 'property', name: 'tags' },
      { type: 'valueFilter', value: 'urgent' },
    ])).toBe("$.tags[?(@=='urgent')]");
  });

  it('round-trips with parseAtomPath for canonical paths', () => {
    const paths = [
      '$',
      '$.name',
      '$.user.address.city',
      "$.config['a.b']",
      '$.items[0]',
      '$.items[?(@.id==42)]',
      "$.items[?(@.name=='Widget')]",
      "$.tags[?(@=='urgent')]",
      '$.items[?(@.id==1)].name',
    ];
    for (const path of paths) {
      expect(buildAtomPath(parseAtomPath(path))).toBe(path);
    }
  });
});

describe('atomicPathToAtomPath', () => {
  it('converts $.$root to $', () => {
    expect(atomicPathToAtomPath('$.$root')).toBe('$');
  });

  it('converts simple dot paths unchanged', () => {
    expect(atomicPathToAtomPath('$.name')).toBe('$.name');
    expect(atomicPathToAtomPath('$.user.name')).toBe('$.user.name');
  });

  it('quotes unquoted bracket properties', () => {
    expect(atomicPathToAtomPath('$[a.b]')).toBe("$['a.b']");
  });

  it('preserves already-quoted bracket properties', () => {
    expect(atomicPathToAtomPath("$['a.b']")).toBe("$['a.b']");
  });

  it('preserves array indices', () => {
    expect(atomicPathToAtomPath('$.items[0]')).toBe('$.items[0]');
  });

  it('preserves simple identifier filter keys', () => {
    expect(atomicPathToAtomPath("$.items[?(@.id=='1')]")).toBe("$.items[?(@.id=='1')]");
  });

  it('preserves nested dot-notation filter keys', () => {
    expect(atomicPathToAtomPath("$.a[?(@.c.d=='20')]")).toBe("$.a[?(@.c.d=='20')]");
  });

  it('preserves already bracket-quoted filter keys', () => {
    expect(atomicPathToAtomPath("$.a[?(@['c.d']=='20')]")).toBe("$.a[?(@['c.d']=='20')]");
  });

  it('handles bracket property with special characters', () => {
    expect(atomicPathToAtomPath('$[foo-bar]')).toBe("$['foo-bar']");
  });

  it('throws when path does not start with $', () => {
    expect(() => atomicPathToAtomPath('invalid')).toThrow(/must start with/);
  });

  it('throws on unexpected character', () => {
    expect(() => atomicPathToAtomPath('$!bad')).toThrow(/Unexpected character/);
  });

  it('handles paths with filters and deep properties', () => {
    expect(atomicPathToAtomPath("$.items[?(@.id=='1')].name")).toBe("$.items[?(@.id=='1')].name");
  });

  it('handles filter literal containing )]', () => {
    expect(atomicPathToAtomPath("$.items[?(@.name=='val)]ue')]")).toBe("$.items[?(@.name=='val)]ue')]");
  });
});

describe('atomPathToAtomicPath', () => {
  it('converts $ to $.$root', () => {
    expect(atomPathToAtomicPath('$')).toBe('$.$root');
  });

  it('passes through simple dot paths', () => {
    expect(atomPathToAtomicPath('$.name')).toBe('$.name');
  });

  it('strips bracket-property quotes', () => {
    expect(atomPathToAtomicPath("$['a.b']")).toBe('$[a.b]');
  });

  it('re-quotes numeric filter literals as strings', () => {
    expect(atomPathToAtomicPath('$.items[?(@.id==42)]')).toBe("$.items[?(@.id=='42')]");
  });

  it('re-quotes boolean filter literals as strings', () => {
    expect(atomPathToAtomicPath('$.items[?(@.active==true)]')).toBe("$.items[?(@.active=='true')]");
  });

  it('re-quotes null filter literals as strings', () => {
    expect(atomPathToAtomicPath('$.items[?(@.status==null)]')).toBe("$.items[?(@.status=='null')]");
  });

  it('preserves already string-quoted filter literals', () => {
    expect(atomPathToAtomicPath("$.items[?(@.id=='42')]")).toBe("$.items[?(@.id=='42')]");
  });

  it('handles value filter re-quoting', () => {
    expect(atomPathToAtomicPath('$.scores[?(@==100)]')).toBe("$.scores[?(@=='100')]");
  });

  it('handles deep path after filter with re-quoting', () => {
    expect(atomPathToAtomicPath('$.items[?(@.id==1)].name')).toBe("$.items[?(@.id=='1')].name");
  });

  it('preserves array indices', () => {
    expect(atomPathToAtomicPath('$.items[0]')).toBe('$.items[0]');
  });

  it('throws when path does not start with $', () => {
    expect(() => atomPathToAtomicPath('invalid')).toThrow(/must start with/);
  });

  it('throws on unexpected character after [', () => {
    expect(() => atomPathToAtomicPath('$[!bad]')).toThrow(/Unexpected character after/);
  });

  it('throws on unexpected character in path', () => {
    expect(() => atomPathToAtomicPath('$!bad')).toThrow(/Unexpected character/);
  });

  it('handles filter literal containing )]', () => {
    expect(atomPathToAtomicPath("$.items[?(@.name=='val)]ue')]")).toBe("$.items[?(@.name=='val)]ue')]");
  });

  it('converts bracket-notation filter keys to dot notation for v4', () => {
    expect(atomPathToAtomicPath("$.a[?(@['c.d']=='20')]")).toBe("$.a[?(@.c.d=='20')]");
  });

  it('converts bracket filter keys with typed literals to string-quoted', () => {
    expect(atomPathToAtomicPath("$.items[?(@['pos.num']==42)]")).toBe("$.items[?(@.pos.num=='42')]");
  });
});

describe('extractKeyFromAtomicPath', () => {
  it('extracts $root from root path', () => {
    expect(extractKeyFromAtomicPath('$.$root')).toBe('$root');
  });

  it('extracts last dot property', () => {
    expect(extractKeyFromAtomicPath('$.user.name')).toBe('name');
  });

  it('extracts array index', () => {
    expect(extractKeyFromAtomicPath('$.items[0]')).toBe('0');
  });

  it('extracts filter key value', () => {
    expect(extractKeyFromAtomicPath("$.items[?(@.id=='42')]")).toBe('42');
  });

  it('extracts value filter key', () => {
    expect(extractKeyFromAtomicPath("$.tags[?(@=='urgent')]")).toBe('urgent');
  });

  it('extracts property after filter (deep path)', () => {
    expect(extractKeyFromAtomicPath("$.items[?(@.id=='1')].name")).toBe('name');
  });

  it('extracts bracket property key (non-numeric, non-filter)', () => {
    expect(extractKeyFromAtomicPath('$[a.b]')).toBe('a.b');
  });

  it('returns the path itself as fallback', () => {
    expect(extractKeyFromAtomicPath('$')).toBe('$');
  });
});

describe('v4 ↔ atom path round-trips', () => {
  it('round-trips simple filter keys through both conversions', () => {
    const v4Path = "$.items[?(@.id=='42')]";
    const atomPath = atomicPathToAtomPath(v4Path);
    expect(atomPath).toBe("$.items[?(@.id=='42')]");
    expect(atomPathToAtomicPath(atomPath)).toBe(v4Path);
  });

  it('round-trips nested dot-notation filter keys (v4 → atom → v4)', () => {
    const v4Path = "$.a[?(@.c.d=='20')]";
    const atomPath = atomicPathToAtomPath(v4Path);
    // Nested path stays as dot notation in atom format
    expect(atomPath).toBe("$.a[?(@.c.d=='20')]");
    const roundTripped = atomPathToAtomicPath(atomPath);
    expect(roundTripped).toBe(v4Path);
  });

  it('round-trips bracket filter keys with typed literals', () => {
    const atomPath = "$.items[?(@['pos.num']==42)]";
    const v4Path = atomPathToAtomicPath(atomPath);
    expect(v4Path).toBe("$.items[?(@.pos.num=='42')]");
    const backToAtom = atomicPathToAtomPath(v4Path);
    // Nested path (each segment is valid identifier) → dot notation
    expect(backToAtom).toBe("$.items[?(@.pos.num=='42')]");
  });

  it('atom canonical paths round-trip through parse + build', () => {
    const canonicalPaths = [
      '$',
      '$.name',
      '$.user.name',
      "$.config['a.b']",
      '$.items[0]',
      '$.items[?(@.id==42)]',
      "$.items[?(@.name=='Widget')]",
      '$.items[?(@.positionNumber.value==42)]',
      "$.tags[?(@=='urgent')]",
      '$.items[?(@.id==1)].name',
    ];
    for (const path of canonicalPaths) {
      expect(buildAtomPath(parseAtomPath(path))).toBe(path);
    }
  });

  it('round-trips bracket-notation filter keys containing dots', () => {
    // Bracket notation = literal property name, must not become dot notation
    const path = "$.a[?(@['c.d']=='20')]";
    expect(buildAtomPath(parseAtomPath(path))).toBe(path);
  });
});
