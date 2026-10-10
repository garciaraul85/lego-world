import { z } from 'zod';

/** What “Do it for me” (and the “Show me” demo) performs. `$map`, `$spawn`… are filled in at run time. */
export const Do = z.union([
  z.strictObject({
    ui: z.enum([
      'workspace',
      'right',
      'dock',
      'tool',
      'menu',
      'palette',
      'logicView',
      'fit',
      'play',
      'stop',
      'pause',
      'assetCat',
    ]),
    value: z.union([z.string(), z.boolean(), z.null()]).optional(),
  }),
  z.strictObject({ action: z.string() }),
  z.strictObject({ click: z.string() }),
  z.strictObject({ cmd: z.string(), args: z.record(z.string(), z.unknown()) }),
  z.strictObject({ fn: z.string(), args: z.record(z.string(), z.unknown()).optional() }),
]);
export type Do = z.infer<typeof Do>;

/** How the tutorial knows the user did the task. */
export const Check = z.union([
  /** a matching command ran (payload fields in `where` must match) */
  z.strictObject({ kind: z.literal('command'), type: z.string(), where: z.record(z.string(), z.unknown()).optional() }),
  /** a named test on the editor state passes (checks.ts) */
  z.strictObject({ kind: z.literal('state'), test: z.string(), args: z.unknown().optional() }),
  /** something happened in Play */
  z.strictObject({ kind: z.literal('play'), event: z.enum(['running', 'stopped', 'moved', 'paused']) }),
  /** an element is on screen */
  z.strictObject({ kind: z.literal('dom'), selector: z.string() }),
  /** Next only */
  z.strictObject({ kind: z.literal('manual') }),
]);
export type Check = z.infer<typeof Check>;

export const Step = z.strictObject({
  id: z.string().regex(/^[a-z]+\.[a-zA-Z]+$/),
  title: z.string().min(1).max(60),
  /** what this feature is and how it works */
  body: z.string().min(1).max(600),
  /** the one thing to do now */
  task: z.string().min(1).max(200),
  /** CSS selector of the control to spotlight */
  target: z.string().min(1),
  /** workspace the step happens in (opened when the step starts) */
  workspace: z.string().optional(),
  placement: z.enum(['left', 'right', 'top', 'bottom', 'center']).optional(),
  check: Check,
  doItForMe: z.array(Do),
  /** panel changes made when the step opens, so its control is on screen (e.g. the Map tab) */
  setup: z.array(Do).optional(),
  /** code to type, shown in the card (coding course); {{tokens}} are filled from the sandbox */
  code: z.string().max(2000).optional(),
  /** a keyboard shortcut or tip shown under the task */
  tip: z.string().max(200).optional(),
});
export type Step = z.infer<typeof Step>;

export const Chapter = z.strictObject({
  id: z.string(),
  title: z.string(),
  steps: z.array(Step).min(1),
});
export type Chapter = z.infer<typeof Chapter>;
