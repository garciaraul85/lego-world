export type Problem = {
  level: 'info' | 'warn' | 'error';
  /** stable machine code, e.g. "legacy.unknownField" */
  code: string;
  message: string;
  /** project file the problem is about, when there is one */
  file?: string;
};
