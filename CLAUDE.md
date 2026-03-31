# CLAUDE.md

Project conventions and architecture for AI-assisted development.

## Build & Test

```sh
npm run build          # tsup --format cjs,esm (outputs to dist/)
npm run lint           # eslint src/**/*.ts
npm test               # jest --config jest.config.mjs
npx tsc --noEmit       # type check without emitting
```

## Project Structure

```
src/
  index.ts          # Re-exports from all modules
  jsonDiff.ts       # Core diff engine: diff, applyChangeset, revertChangeset,
                    #   atomizeChangeset, unatomizeChangeset
  jsonCompare.ts    # Enriched comparison: compare, enrich, applyChangelist
  helpers.ts        # Shared utilities: splitJSONPath, keyBy, setByPath
  atomPath.ts      # JSON Atom path parsing, canonicalization, conversion
  jsonAtom.ts      # JSON Atom APIs: diffAtom, applyAtom, revertAtom,
                    #   invertAtom, toAtom, fromAtom, validateAtom
tests/
  __fixtures__/     # Test fixtures (jsonDiff fixtures + json-atom conformance)
```

## Key Architecture Notes

- **Internal format**: Hierarchical `IChange[]` tree (v4). Flat `IAtomicChange[]` via atomize/unatomize.
- **JSON Atom format**: Flat `IAtomOperation[]` in an `IJsonAtom` envelope. Spec at [json-atom-format](https://github.com/ltwlf/json-atom-format).
- **Adapter pattern**: `jsonAtom.ts` converts between internal and atom formats. No changes to `jsonDiff.ts`.
- **`diffAtom`** always uses `treatTypeChangeAsReplace: true` and merges REMOVE+ADD pairs into single `replace` ops.
- **`applyAtom`** processes operations sequentially with dedicated root (`$`) handling.
- **`fromAtom`** returns `IAtomicChange[]` (1:1 mapping), NOT `Changeset`.
- **Path differences**: Internal uses `$[a.b]` (no quotes); atom spec requires `$['a.b']` (single-quoted). Internal always string-quotes filter literals; spec requires type-correct literals.

## Known Limitations (don't try to fix in jsonDiff.ts)

- `unatomizeChangeset` regex only matches string-quoted filter literals (B.2 in plan)
- `applyChangeset` doesn't handle `$root` leaf operations correctly (B.4)
- `atomizeChangeset` has `isTestEnv` check (lines 175-178) — orthogonal smell
- `filterExpression` numeric branch is dead code (B.8)

## Conventions

- ESM-first (`"type": "module"` in package.json), dual CJS/ESM output via tsup
- TypeScript strict mode (`noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`)
- `strictNullChecks` is OFF (tsconfig)
- Zero runtime dependencies
- Tests use Jest with ts-jest
- Existing tests use snapshots — don't update snapshots without verifying changes
