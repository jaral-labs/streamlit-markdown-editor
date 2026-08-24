import path from 'node:path'
import process from 'node:process'
import { defineConfig, UserConfig } from 'vite'
import license from 'rollup-plugin-license'

// Builds the frontend as an ES-module library bundle. Streamlit's v2 host
// imports the default-exported renderer from this bundle; the hashed filename
// is matched by the Python side's `js="index-*.js"` glob.
export default defineConfig(() => {
  const isProd = process.env.NODE_ENV === 'production'
  const isDev = !isProd
  // Regenerate the third-party license notice only under `npm run licenses`
  // (GEN_LICENSES=1), not on every build — the committed root file would
  // otherwise churn on each `npm run build`.
  const genLicenses = process.env.GEN_LICENSES === '1'
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
      rollupOptions: {
        plugins: genLicenses
          ? [
              license({
                thirdParty: {
                  includePrivate: false,
                  output: {
                    file: path.resolve(
                      process.cwd(),
                      '..',
                      'THIRD_PARTY_LICENSES.txt',
                    ),
                  },
                },
              }),
            ]
          : [],
      },
    },
  } satisfies UserConfig
})
