/** `import text from './file.js?raw'` gives the file's text (Vite/Vitest natively; esbuild via scripts/build.mjs). */
declare module '*?raw' {
  const text: string;
  export default text;
}

/** CSS imported for its side effect; esbuild emits it next to the bundle and inline-html inlines it. */
declare module '*.css';
