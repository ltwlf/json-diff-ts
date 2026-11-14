import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { applyAtom, revertAtom, validateAtom } from '../src/index.js';

const directory = join(__dirname, '__fixtures__', 'json-atom');
const fixtures = readdirSync(directory).filter(name => name.endsWith('.json'))
  .map(name => JSON.parse(readFileSync(join(directory, name), 'utf8')));

describe('shared JSON Atom specification fixtures', () => {
  it.each(fixtures)('$name', fixture => {
    expect(validateAtom(fixture.delta).valid).toBe(true);
    expect(applyAtom(structuredClone(fixture.source), fixture.delta)).toEqual(fixture.target);
    if (fixture.level === 2) {
      expect(revertAtom(structuredClone(fixture.target), fixture.delta)).toEqual(fixture.source);
    }
  });
});
