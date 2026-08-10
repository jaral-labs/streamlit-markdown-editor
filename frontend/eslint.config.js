import js from '@eslint/js'
import tseslint from 'typescript-eslint'

// Flat config (ESLint 9+). typescript-eslint's `config()` helper composes the
// JS + TS recommended rule sets; Prettier owns formatting, so no stylistic
// rules here.
export default tseslint.config(
  { ignores: ['build/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
)
