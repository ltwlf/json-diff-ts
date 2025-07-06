import { splitJSONPath, setByPath } from '../src/helpers'; // Adjust the import path as necessary

describe('splitJSONPath', () => {
  it('should split a simple path correctly', () => {
    expect(splitJSONPath('$.key.subkey')).toEqual(['$', 'key', 'subkey']);
  });

  it('should handle nested brackets correctly', () => {
    expect(splitJSONPath('$.key.subkey[1].name')).toEqual(['$', 'key', 'subkey[1]', 'name']);
  });

  it('should not split inside single quotes', () => {
    expect(splitJSONPath("$.key['sub.key'].subkey")).toEqual(['$', "key['sub.key']", 'subkey']);
  });

  it('should manage complex paths with mixed brackets and quotes', () => {
    expect(splitJSONPath("$.key.subkey['another.key'][1].value")).toEqual(['$', 'key', "subkey['another.key'][1]", 'value']);
  });

  it('should ignore escaped single quotes within quotes', () => {
    expect(splitJSONPath("$.key['sub\\'key'].subkey")).toEqual(['$', "key['sub\\'key']", 'subkey']);
  });

  it('should correctly split path with complex filter expressions containing periods', () => {
    const result = splitJSONPath("$.characters[?(@.id=='LUK.A')].name");
    expect(result).toEqual(['$', "characters[?(@.id=='LUK.A')]", 'name']);
  });

  it('should correctly split path with filter expressions', () => {
    const result = splitJSONPath("$.characters[?(@.id=='LUK')].name");
    expect(result).toEqual(['$', "characters[?(@.id=='LUK')]", 'name']);
  });

  it('should handle path ending with bracket', () => {
    const result = splitJSONPath("$.characters[0]");
    expect(result).toEqual(['$', "characters[0]"]);
  });
});

describe('setByPath', () => {
  it('should create array when next part is numeric', () => {
    const obj = {};
    setByPath(obj, '$.items.0.name', 'value');
    expect(obj).toEqual({ $: { items: [{ name: 'value' }] } });
  });

  it('should create object when next part is not numeric', () => {
    const obj = {};
    setByPath(obj, '$.items.details.name', 'value');
    expect(obj).toEqual({ $: { items: { details: { name: 'value' } } } });
  });
});
