/** Exercise actual TypeScript ↔ Python JSON exchange, plus the shared spec fixtures.
 * Build first, then run:
 * JSON_ATOM_PYTHON=../json-atom-py/.venv/bin/python node scripts/check-interop.mjs
 * Override JSON_ATOM_PY_SOURCE when the Python source is not in the sibling checkout.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { diffAtom, applyAtom, revertAtom, validateAtom } from '../dist/index.js';

const fixtureDir = new URL('../tests/__fixtures__/json-atom/', import.meta.url);
const fixtures = readdirSync(fixtureDir).filter(name => name.endsWith('.json'))
  .map(name => JSON.parse(readFileSync(new URL(name, fixtureDir), 'utf8')));
const cases = [
  { name: 'nested booleans and numbers', source: { flags: [true, false] }, target: { flags: [1, 0] } },
  { name: 'keyed array update/add', source: { items: [{ id: 1, value: 'a' }] }, target: { items: [{ id: 1, value: 'b' }, { id: 2, value: null }] }, keys: { items: 'id' } },
  { name: 'nested identity', source: { items: [{ meta: { id: 42 }, value: 1 }] }, target: { items: [{ meta: { id: 42 }, value: 2 }] }, keys: { items: 'meta.id' } },
  { name: 'primitive identity', source: { tags: ['one'] }, target: { tags: ['one', 'two'] }, keys: { tags: '$value' } },
  { name: 'quoted identity', source: { items: [{ id: "O'Brien", value: 1 }] }, target: { items: [{ id: "O'Brien", value: 2 }] }, keys: { items: 'id' } },
];
let seed = 1729;
const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) % n; };
function value(depth = 0) {
  const scalar = [null, true, false, 0, 1, -2, 0.25, '', "O'Brien", '☃'];
  const kind = random(depth < 3 ? 4 : 2);
  if (kind < 2) return scalar[random(scalar.length)];
  if (kind === 2) return Array.from({ length: random(4) }, () => value(depth + 1));
  return Object.fromEntries(['name', 'a.b', "it's", 'x[y]'].slice(0, random(5)).map(k => [k, value(depth + 1)]));
}
for (let i = 0; i < 200; i++) cases.push({ name: `seeded ${i}`, source: value(), target: value() });
for (const c of cases) c.tsAtom = diffAtom(c.source, c.target, { arrayIdentityKeys: c.keys });
const python = String.raw`
import copy, json, sys
from json_atom import apply_delta, diff_delta, revert_delta, validate_delta
from json_atom._utils import json_equal
payload = json.load(sys.stdin)
for f in payload['fixtures']:
    assert validate_delta(f['delta']).valid, f['name']
    assert json_equal(apply_delta(copy.deepcopy(f['source']), f['delta']), f['target']), f['name']
    if f['level'] == 2:
        assert json_equal(revert_delta(copy.deepcopy(f['target']), f['delta']), f['source']), f['name']
output = []
for c in payload['cases']:
    assert validate_delta(c['tsAtom']).valid, c['name']
    actual = apply_delta(copy.deepcopy(c['source']), c['tsAtom'])
    assert json_equal(actual, c['target']), ('TypeScript -> Python', c['name'], actual, c['target'])
    assert json_equal(revert_delta(copy.deepcopy(actual), c['tsAtom']), c['source']), c['name']
    delta = diff_delta(c['source'], c['target'], array_identity_keys=c.get('keys'))
    # Delta is falsy when empty; plain dict preserves its envelope in json.dump.
    output.append(dict(delta))
json.dump(output, sys.stdout, allow_nan=False)
`;
const result = spawnSync(process.env.JSON_ATOM_PYTHON || 'python3', ['-c', python], {
  input: JSON.stringify({ fixtures, cases }), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
  env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONPATH: process.env.JSON_ATOM_PY_SOURCE || fileURLToPath(new URL('../../json-atom-py/src', import.meta.url)) },
});
if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
const pythonAtoms = JSON.parse(result.stdout);
for (let i = 0; i < cases.length; i++) {
  const c = cases[i], atom = pythonAtoms[i];
  assert.equal(validateAtom(atom).valid, true, JSON.stringify({name:c.name,source:c.source,target:c.target,atom,errors:validateAtom(atom).errors}));
  const applied = applyAtom(structuredClone(c.source), atom);
  assert.deepEqual(applied, c.target, `Python -> TypeScript: ${c.name}`);
  assert.deepEqual(revertAtom(structuredClone(applied), atom), c.source, c.name);
}
for (const f of fixtures) {
  assert.equal(validateAtom(f.delta).valid, true, f.name);
  assert.deepEqual(applyAtom(structuredClone(f.source), f.delta), f.target, f.name);
  if (f.level === 2) assert.deepEqual(revertAtom(structuredClone(f.target), f.delta), f.source, f.name);
}
console.log(`${fixtures.length} shared fixtures pass in both runtimes; ${cases.length} generated pairs pass in both directions, including undo.`);
