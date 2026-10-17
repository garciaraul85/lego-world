declare const __BUILD__: string;

/** P32: the build (git commit and time) this editor was made from; tests and dev runs show “dev”. */
export const BUILD: string = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';
