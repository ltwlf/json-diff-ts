// jest.config.js
export default {
  preset: 'ts-jest/presets/default', // or other ESM presets (use ts-jest/presets/default-esm if lodash-es is used)
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    // '^.+\\.[tj]sx?$' to process js/ts with `ts-jest`
    // '^.+\\.m?[tj]sx?$' to process js/ts/mjs/mts with `ts-jest`
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: false // true if lodash-es is used
      }
    ]
  }
};
