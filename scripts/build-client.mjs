/**
 * Build the browser client bundle for the harness web surface.
 *
 * Emits `lib/client.js` in the harness client-module format: a closure
 * factory registered via `window.__ModuleLoader__.load({ id, factory })`
 * (mirrors the repo's shared `tsdown.client.ts` preset). Platform modules
 * stay external — the loader's module table answers `require()` for them;
 * everything else (this plugin's code) is inlined.
 */
import { build } from 'esbuild'

const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
]

const PLUGIN_ID = 'dsh-plugin-project-management'

await build({
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  outfile: 'lib/client.js',
  external: [...PLATFORM_MODULES, '@deepseek-ai/dsh-client-runtime/client'],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  jsx: 'automatic',
  sourcemap: true,
  banner: {
    js:
      'var module = { exports: {} }; var exports = module.exports;'
      + `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
  },
  footer: {
    js: 'return module.exports; } });',
  },
})

console.log('built lib/client.js')
