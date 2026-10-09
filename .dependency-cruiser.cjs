/** Module rules from the plan's Architecture & code tab. `npm run depcruise` fails on any violation. */
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'core-is-pure',
      comment: 'src/core has no DOM, engine, editor, platform or legacy dependencies.',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/(engine|editor|platform|apps|legacy)/' },
    },
    {
      name: 'engine-no-editor',
      severity: 'error',
      from: { path: '^src/engine/' },
      to: { path: '^src/(editor|apps|legacy)/' },
    },
    {
      name: 'editor-no-apps',
      severity: 'error',
      from: { path: '^src/editor/' },
      to: { path: '^src/(apps|legacy)/' },
    },
    {
      name: 'platform-only',
      comment: 'Only src/platform may import Tauri or Capacitor.',
      severity: 'error',
      from: { pathNot: '^src/platform/' },
      to: { path: '@tauri-apps|@capacitor' },
    },
    {
      name: 'no-test-imports-in-src',
      severity: 'error',
      from: { path: '^src/' },
      to: { path: '^tests/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^src/legacy/' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
