import { defineConfig, globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores([
    'dist',
    'dist-ssr',
    'dist-e2e',
    'dist-e2e-ssr',
    'coverage',
    'test-results',
    'playwright-report',
    'e2e/.tmp',
    'src/test/fixtures',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended, reactHooks.configs.flat['recommended-latest']],
  },
])
