import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'], // Build for commonJS and ESmodules
  dts: {
    // tsup 8 injects baseUrl into its declaration compiler; suppress only there.
    compilerOptions: { ignoreDeprecations: '6.0' }
  },
  splitting: false,
  sourcemap: true,
  clean: true
})
