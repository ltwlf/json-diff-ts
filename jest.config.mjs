// jest.config.js
export default {
  preset: 'ts-jest/presets/default-esm', // Using ESM preset for lodash-es
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^lodash-es$': 'lodash',
    '^lodash-es/(.*)$': 'lodash/$1'
  },
  transform: {
    // '^.+\\.[tj]sx?$' to process js/ts with `ts-jest`
    // '^.+\\.m?[tj]sx?$' to process js/ts/mjs/mts with `ts-jest`
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true // Enabled for lodash-es
      }
    ]
  }
};
