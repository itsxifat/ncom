import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Reference connectors for merchants' own stacks — PHP, WordPress and an
    // Express router that imports packages this app does not depend on. They
    // are documentation that happens to run, and linting them against this
    // project's rules only produces noise about a codebase that is not here.
    'connectors/**',
  ]),
])

export default eslintConfig
