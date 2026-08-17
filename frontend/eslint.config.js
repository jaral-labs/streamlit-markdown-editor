import js from '@eslint/js'
import security from 'eslint-plugin-security'
import tseslint from 'typescript-eslint'

// Flat config (ESLint 9+). typescript-eslint's `config()` helper composes the
// JS + TS recommended rule sets; eslint-plugin-security adds static security
// checks (the JS analog of bandit); Prettier owns formatting, so no stylistic
// rules here.
export default tseslint.config(
  { ignores: ['build/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended,
  {
    rules: {
      // Too noisy for TypeScript: flags every `arr[i]` / `obj[key]` access
      // (e.g. the block-index lookups in cursor-map.ts). The prototype-pollution
      // risk it targets doesn't apply to this browser component.
      'security/detect-object-injection': 'off',
    },
  },
)
