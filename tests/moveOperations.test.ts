import { diff, applyChangeset, revertChangeset, atomizeChangeset, Operation } from '../src/jsonDiff';

describe('jsonDiff#MOVE operations', () => {
  describe('detectArrayMoves functionality', () => {
    it('should detect MOVE operations when array elements are reordered', () => {
      const before = {
        items: [
          { id: 1, name: 'first' },
          { id: 2, name: 'second' },
          { id: 3, name: 'third' }
        ]
      };

      const after = {
        items: [
          { id: 2, name: 'second' },
          { id: 3, name: 'third' },
          { id: 1, name: 'first' }
        ]
      };

      const diffs = diff(before, after, {
        embeddedObjKeys: { items: 'id' },
        detectArrayMoves: true
      });

      expect(diffs).toHaveLength(1);
      expect(diffs[0].type).toBe(Operation.UPDATE);
      expect(diffs[0].key).toBe('items');
      expect(diffs[0].embeddedKey).toBe('id');
      expect(diffs[0].changes).toHaveLength(3);

      // Verify all changes are MOVE operations
      diffs[0].changes!.forEach(change => {
        expect(change.type).toBe(Operation.MOVE);
        expect(change.oldIndex).toBeDefined();
        expect(change.newIndex).toBeDefined();
        expect(change.oldIndex).not.toBe(change.newIndex);
      });
    });

    it('should not detect MOVE operations when detectArrayMoves is false', () => {
      const before = {
        items: [
          { id: 1, name: 'first' },
          { id: 2, name: 'second' }
        ]
      };

      const after = {
        items: [
          { id: 2, name: 'second' },
          { id: 1, name: 'first' }
        ]
      };

      const diffs = diff(before, after, {
        embeddedObjKeys: { items: 'id' },
        detectArrayMoves: false
      });

      // Should return empty because items haven't changed, just moved
      expect(diffs).toHaveLength(0);
    });

    it('should handle mixed changes with MOVE operations', () => {
      const before = {
        items: [
          { id: 1, name: 'first' },
          { id: 2, name: 'second' },
          { id: 3, name: 'third' }
        ]
      };

      const after = {
        items: [
          { id: 3, name: 'third' },
          { id: 4, name: 'fourth' },
          { id: 1, name: 'first modified' }
        ]
      };

      const diffs = diff(before, after, {
        embeddedObjKeys: { items: 'id' },
        detectArrayMoves: true
      });

      expect(diffs).toHaveLength(1);
      expect(diffs[0].changes).toHaveLength(5); // UPDATE, ADD, REMOVE, MOVE, MOVE

      const changeTypes = diffs[0].changes!.map(change => change.type);
      expect(changeTypes).toContain(Operation.UPDATE);
      expect(changeTypes).toContain(Operation.ADD);
      expect(changeTypes).toContain(Operation.REMOVE);
      expect(changeTypes).toContain(Operation.MOVE);

      // Check that MOVE operations have the correct structure
      const moveOperations = diffs[0].changes!.filter(change => change.type === Operation.MOVE);
      moveOperations.forEach(move => {
        expect(move.oldIndex).toBeDefined();
        expect(move.newIndex).toBeDefined();
      });
    });
  });

  describe('apply and revert MOVE operations', () => {
    it('should apply MOVE operations correctly', () => {
      const before = {
        items: [
          { id: 1, name: 'first' },
          { id: 2, name: 'second' },
          { id: 3, name: 'third' }
        ]
      };

      const after = {
        items: [
          { id: 2, name: 'second' },
          { id: 3, name: 'third' },
          { id: 1, name: 'first' }
        ]
      };

      const diffs = diff(before, after, {
        embeddedObjKeys: { items: 'id' },
        detectArrayMoves: true
      });

      const result = applyChangeset(JSON.parse(JSON.stringify(before)), diffs);
      expect(result).toEqual(after);
    });

    it('should revert MOVE operations correctly', () => {
      const before = {
        items: [
          { id: 1, name: 'first' },
          { id: 2, name: 'second' },
          { id: 3, name: 'third' }
        ]
      };

      const after = {
        items: [
          { id: 2, name: 'second' },
          { id: 3, name: 'third' },
          { id: 1, name: 'first' }
        ]
      };

      const diffs = diff(before, after, {
        embeddedObjKeys: { items: 'id' },
        detectArrayMoves: true
      });

      const result = revertChangeset(JSON.parse(JSON.stringify(after)), diffs);
      expect(result).toEqual(before);
    });
  });

  describe('atomize and unatomize MOVE operations', () => {
    it('should atomize and unatomize MOVE operations correctly', () => {
      const before = {
        items: [
          { id: 1, name: 'first' },
          { id: 2, name: 'second' }
        ]
      };

      const after = {
        items: [
          { id: 2, name: 'second' },
          { id: 1, name: 'first' }
        ]
      };

      const diffs = diff(before, after, {
        embeddedObjKeys: { items: 'id' },
        detectArrayMoves: true
      });

      const atomicChanges = atomizeChangeset(diffs);
      
      // Should have 2 atomic MOVE operations
      expect(atomicChanges).toHaveLength(2);
      atomicChanges.forEach(change => {
        expect(change.type).toBe(Operation.MOVE);
        expect(change.path).toMatch(/^\$\.items\[\?\(@\.id==\d+\)\]$/);
        expect(change.oldIndex).toBeDefined();
        expect(change.newIndex).toBeDefined();
      });

      // Test that atomized changes have proper structure
      expect(atomicChanges[0].valueType).toBe('Object');
      expect(atomicChanges[0].value).toHaveProperty('id');
      expect(atomicChanges[0].value).toHaveProperty('name');
    });
  });

  describe('edge cases', () => {
    it('should handle empty arrays', () => {
      const before = { items: [] as any[] };
      const after = { items: [] as any[] };

      const diffs = diff(before, after, {
        embeddedObjKeys: { items: 'id' },
        detectArrayMoves: true
      });

      expect(diffs).toHaveLength(0);
    });

    it('should handle single element arrays', () => {
      const before = { items: [{ id: 1, name: 'only' }] };
      const after = { items: [{ id: 1, name: 'only' }] };

      const diffs = diff(before, after, {
        embeddedObjKeys: { items: 'id' },
        detectArrayMoves: true
      });

      expect(diffs).toHaveLength(0);
    });

    it('should work with function-based embeddedObjKeys', () => {
      const before = {
        items: [
          { id: 1, name: 'first' },
          { id: 2, name: 'second' }
        ]
      };

      const after = {
        items: [
          { id: 2, name: 'second' },
          { id: 1, name: 'first' }
        ]
      };

      const diffs = diff(before, after, {
        embeddedObjKeys: { items: (obj: any) => obj.id },
        detectArrayMoves: true
      });

      expect(diffs).toHaveLength(1);
      expect(diffs[0].changes).toHaveLength(2);
      diffs[0].changes!.forEach(change => {
        expect(change.type).toBe(Operation.MOVE);
      });
    });
  });
});