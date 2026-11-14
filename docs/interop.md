# JSON Atom interoperability checks

JSON Atom uses `"format": "json-atom"` and wire `"version": 1`. The draft specification is named `spec/v0.md`; neither that filename nor an implementation's package version changes the envelope.

## Projects and package names

| Project | Package | Public API |
| --- | --- | --- |
| [json-diff-ts](https://github.com/ltwlf/json-diff-ts) | npm `json-diff-ts` | `diffAtom`, `applyAtom`, `revertAtom` |
| [json-atom-py](https://github.com/ltwlf/json-atom-py) | PyPI `json-atom`; import `json_atom` | `diff_delta`, `apply_delta`, `revert_delta` |
| [json-atom-format](https://github.com/ltwlf/json-atom-format) | Specification and fixtures | [Wire format](https://github.com/ltwlf/json-atom-format/blob/main/spec/v0.md) |

The apply APIs mutate their input. Clone documents when the original state must be preserved, and always use the returned value for root operations.

## Reproduce the cross-language check

With the Python repository checked out beside this repository and Python 3.12 or later available:

```sh
npm ci --ignore-scripts
npm run build
JSON_ATOM_PYTHON=../json-atom-py/.venv/bin/python node scripts/check-interop.mjs
```

An installed Python virtual environment is not required for the library itself: it has no runtime dependencies. Set `JSON_ATOM_PYTHON=python3` to use a suitable system Python. Set `JSON_ATOM_PY_SOURCE` to override the sibling `json-atom-py/src` directory.

The CI job pins the Python source revision in `.github/workflows/ci.yml`. Update that revision deliberately when accepting an upstream change.

## What is checked

- All 16 shared specification fixtures are applied by both implementations. Level 2 fixtures are also inverted and reverted.
- Five named examples cover nested boolean/number changes, keyed collection updates, nested identities, primitive identities, and quoted strings.
- Another 200 deterministic generated source/target pairs cover nested arrays and objects, null-root lifecycle, type changes, special property names, and scalar values.
- TypeScript computes each atom, serializes it to JSON, and Python applies and reverts it. Python computes its own atom, serializes it back, and TypeScript applies and reverts it.

The check compares resulting documents, not operation ordering: a diff algorithm is not part of the wire specification, and different valid atoms can describe the same transition.

Fixtures are mirrored from [json-atom-format at c5d1f49](https://github.com/ltwlf/json-atom-format/commit/c5d1f49) into `tests/__fixtures__/json-atom/`; their JSON contents are identical in all three repositories. The extended checks use [Python source 40ccd55](https://github.com/ltwlf/json-atom-py/commit/40ccd5520b08757c5a16453889a1e4dea263c0b0). Those Python corrections are included in **PyPI `json-atom` 0.4.2**; they are not part of the older 0.4.1 artifact.

## Boundaries to preserve

- **Package name:** install Python with `pip install json-atom`, not `pip install json-atom-py`.
- **Empty Python deltas:** serialize `dict(delta)`, for example `json.dumps(dict(delta))` or `json.dump(dict(delta), output_file)`. `Delta` uses operation-count truthiness; Python's streaming or indented encoder can otherwise drop an empty envelope.
- **Array order:** key/value identity describes membership and values. It does not encode pure reorderings or retain original insertion positions on undo. Use index-based diffs when exact ordering matters.
- **Numeric precision:** Python integers can exceed JavaScript's safe integer range. Use string identities for such values; the generated cases stay within shared numeric limits.
- **Typed identity:** consumers distinguish numbers, strings, and booleans. The TypeScript diff producer rejects identities that collide after string conversion; use consistent ID types when producing keyed diffs.
- **Local options:** TypeScript's `keysToSkip` / `keysToInclude` and Python's `exclude_keys` / `exclude_paths` are local diff controls, not wire fields. Regex skipping is not a promise of identical option APIs.
- **Errors and validation:** Python's `validate_delta` is primarily structural; TypeScript's `validateAtom` additionally checks path grammar and JSON payloads. Both executors enforce path preconditions. A failed move preserves its source, but an entire multi-operation document is not a transaction: earlier operations may already have succeeded.

These checks establish the tested scenarios; they are not an exhaustive proof of equivalence for every input or runtime.
