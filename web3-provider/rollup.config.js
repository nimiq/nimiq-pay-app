import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import nodePolyfills from 'rollup-plugin-polyfill-node';

export default {
  input: 'src/provider.ts',
  output: {
    file: 'dist/provider.js',
    format: 'iife',
    sourcemap: true,
  },
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false,
      extensions: ['.js', '.ts', '.json']
    }),
    commonjs(),
    nodePolyfills(),
    typescript()
  ]
};
