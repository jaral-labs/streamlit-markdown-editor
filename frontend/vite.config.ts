import process from 'node:process'
import { defineConfig, UserConfig } from 'vite'

// Builds the frontend as an ES-module library bundle. Streamlit's v2 host
// imports the default-exported renderer from this bundle; the hashed filename
// is matched by the Python side's `js="index-*.js"` glob.
export default defineConfig(() => {
  const isProd = process.env.NODE_ENV === 'production'
  const isDev = !isProd
  return {
    base: './',
    define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV) },
    build: {
      minify: isDev ? false : 'oxc',
      outDir: 'build',
      sourcemap: isDev,
      lib: {
        entry: './src/index.ts',
        name: 'StreamlitMarkdownEditor',
        formats: ['es'],
        fileName: 'index-[hash]',
      },
    },
  } satisfies UserConfig
})
