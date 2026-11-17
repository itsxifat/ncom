/**
 * Lets a check script load server modules outside Next.js.
 *
 * `server-only` throws when imported anywhere but a React Server Component
 * build. Running a script with `--conditions=react-server` avoids that, but
 * also swaps in React's server build, which has no `createContext` — and the
 * auth stack (next-auth → next/navigation) needs it. This resolves
 * `server-only` to an empty module instead, so the ordinary React build loads.
 *
 *   tsx --require ./scripts/support/no-server-only.cjs scripts/<check>.mts
 */
const Module = require('node:module')
const original = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request === 'server-only') return require.resolve('./empty-module.cjs')
  return original.call(this, request, ...rest)
}
