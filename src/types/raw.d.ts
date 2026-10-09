/** `import text from './file.js?raw'` gives the file's text (Vite/Vitest natively; esbuild via scripts/build.mjs). */
declare module '*?raw' {
  const text: string;
  export default text;
}
