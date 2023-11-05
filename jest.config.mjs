// jest.config.js
export default {
  preset: 'ts-jest/presets/default-esm',
  transform: {
    '^.+\\.(t|j)sx?$': [
      'ts-jest',
      {
        // your ts-jest configuration here
        useESM: true
      }
    ]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },

  extensionsToTreatAsEsm: ['.ts', '.tsx']
};
