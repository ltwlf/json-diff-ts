import { diff, diffAtom, applyAtom } from '../src/index.js';

describe('regex path selection regressions', () => {
  const before = { items: [{ id: 1, secret: 'a', visible: 0 }, { id: 2, secret: 'b', visible: 0 }] };
  const after = { items: [{ id: 1, secret: 'x', visible: 1 }, { id: 2, secret: 'y', visible: 2 }] };

  it.each(['g', 'y', 'gy'])('reuses %s regexes without reading or mutating caller lastIndex', flags => {
    const pattern = new RegExp('^items\\.secret$', flags);
    pattern.lastIndex = 42;
    Object.freeze(pattern);
    const options = { keysToSkip: [pattern] as const, arrayIdentityKeys: { items: 'id' } };
    const expected = diff(before, after, { ...options, keysToSkip: ['items.secret'] });
    for (let i = 0; i < 3; i++) {
      expect(diff(before, after, options)).toEqual(expected);
      const atom = diffAtom(before, after, options);
      expect(applyAtom(structuredClone(before), atom)).toEqual({
        items: [{ id: 1, secret: 'a', visible: 1 }, { id: 2, secret: 'b', visible: 2 }]
      });
      expect(pattern.lastIndex).toBe(42);
    }
  });

  it('lets regex skips take precedence over included paths', () => {
    expect(diff(before, after, { keysToInclude: ['items.secret'], keysToSkip: [/\.secret$/g] })).toEqual([]);
    expect(diffAtom(before, after, { keysToInclude: ['items.secret'], keysToSkip: [/\.secret$/g] }).operations).toEqual([]);
  });

  it('skips matching properties before reading their values', () => {
    const unreadable = { get secret() { throw new Error('must not be read'); }, visible: 1 };
    expect(diff(unreadable, unreadable, { keysToSkip: [/^secret$/] })).toEqual([]);
  });

  it('does not apply property regexes to the document root', () => {
    expect(diff({ keep: 1, skip: 1 }, { keep: 2, skip: 2 }, { keysToSkip: [/^(?!keep$)/] })).toEqual([
      { type: 'UPDATE', key: 'keep', value: 2, oldValue: 1 }
    ]);
  });
});

  describe('regex keysToSkip', () => {
    const base = {
      user: { name: 'Alice', secret: 'abc123' },
      config: { secret: 'xyz', timeout: 30 }
    };

    it('skips paths matched by a regex pattern', () => {
      const updated = {
        user: { name: 'Alice', secret: 'changed' },
        config: { secret: 'changed', timeout: 30 }
      };
      expect(diff(base, updated, { keysToSkip: [/\.secret$/] })).toEqual([]);
    });

    it('skips add of a path matched by regex', () => {
      const withoutSecrets = {
        user: { name: 'Alice' },
        config: { timeout: 30 }
      };
      expect(diff(withoutSecrets, base, { keysToSkip: [/\.secret$/] })).toEqual([]);
    });

    it('skips removal of a path matched by regex', () => {
      const withoutSecrets = {
        user: { name: 'Alice' },
        config: { timeout: 30 }
      };
      expect(diff(base, withoutSecrets, { keysToSkip: [/\.secret$/] })).toEqual([]);
    });

    it('still detects changes to non-matching paths', () => {
      const updated = {
        user: { name: 'Bob', secret: 'changed' },
        config: { secret: 'changed', timeout: 60 }
      };
      expect(diff(base, updated, { keysToSkip: [/\.secret$/] })).toEqual([
        { type: 'UPDATE', key: 'user', changes: [{ type: 'UPDATE', key: 'name', value: 'Bob', oldValue: 'Alice' }] },
        { type: 'UPDATE', key: 'config', changes: [{ type: 'UPDATE', key: 'timeout', value: 60, oldValue: 30 }] }
      ]);
    });

    it('can mix string and regex entries in keysToSkip', () => {
      const updated = {
        user: { name: 'Bob', secret: 'changed' },
        config: { secret: 'changed', timeout: 60 }
      };
      expect(diff(base, updated, { keysToSkip: [/\.secret$/, 'config.timeout'] })).toEqual([
        { type: 'UPDATE', key: 'user', changes: [{ type: 'UPDATE', key: 'name', value: 'Bob', oldValue: 'Alice' }] }
      ]);
    });

    describe('children of a path', () => {
      const base = {
        property: {
          name: 'Alice',
          address: {
            formattedAddress: '123 Main St',
              utcOffset: 0,
          }
        }
      };

      it('ignores property changes inside the matched path', () => {
        const withChangedAddress = {
          property: {
            name: 'Alice',
            address: {
              formattedAddress: 'New Address',
                utcOffset: 5,
            }
          }
        };
        expect(diff(base, withChangedAddress, { keysToSkip: [/^property\.address\./] })).toEqual([]);
      });

      it('detects removal of the matched path itself', () => {
        const withoutAddress = { property: { name: 'Alice' } };
        expect(diff(base, withoutAddress, { keysToSkip: [/^property\.address\./] })).toEqual([
          {
            type: 'UPDATE',
            key: 'property',
            changes: [{ type: 'REMOVE', key: 'address', value: base.property.address }]
          }
        ]);
      });

      it('detects addition of the matched path itself', () => {
        const withoutAddress = { property: { name: 'Alice' } };
        expect(diff(withoutAddress, base, { keysToSkip: [/^property\.address\./] })).toEqual([
          {
            type: 'UPDATE',
            key: 'property',
            changes: [{ type: 'ADD', key: 'address', value: base.property.address }]
          }
        ]);
      });
    });

    it('skips all properties except one', () => {
      const base = {
        address: { street: '123 Main St', city: 'Springfield', zip: '12345' }
      };
      const updated = {
        address: { street: 'New Street', city: 'Shelbyville', zip: '99999' }
      };

      expect(diff(base, updated, { keysToSkip: [/^address\.(?!city$)/] })).toEqual([
        {
          type: 'UPDATE',
          key: 'address',
          changes: [{ type: 'UPDATE', key: 'city', value: 'Shelbyville', oldValue: 'Springfield' }]
        }
      ]);
    });
  });

