import { z } from 'zod';
import { ActionList } from './action';
import { id, Vec2 } from './common';

export type Widget = {
  type: 'panel' | 'text' | 'image' | 'button' | 'hearts' | 'bar' | 'list' | 'dialogue' | 'minimap' | 'slot';
  id?: string;
  anchor?: [number, number];
  offset?: [number, number];
  text?: string;
  label?: string;
  bind?: string[];
  style?: Record<string, string | number>;
  touchOnly?: boolean;
  sound?: string;
  onPress?: z.infer<typeof ActionList>;
  children?: Widget[];
};

export const Widget: z.ZodType<Widget> = z.lazy(() =>
  z.strictObject({
    type: z.enum(['panel', 'text', 'image', 'button', 'hearts', 'bar', 'list', 'dialogue', 'minimap', 'slot']),
    id: z.string().optional(),
    anchor: Vec2.optional(),
    offset: Vec2.optional(),
    text: z.string().optional(),
    label: z.string().optional(),
    bind: z.array(z.string()).optional(),
    style: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    touchOnly: z.boolean().optional(),
    sound: id('sound').optional(),
    onPress: ActionList.optional(),
    children: z.array(Widget).optional(),
  }),
);

/** screens/<screenId>.json — layout at a 1280x720 reference, anchors 0..1 of the parent */
export const Screen = z.strictObject({
  id: id('screen'),
  kind: z.enum(['splash', 'title', 'hud', 'pause', 'dialogue', 'gameover', 'custom']),
  name: z.string().min(1).max(60),
  root: Widget,
  music: id('music').nullable(),
  pausesGame: z.boolean(),
  /** runs when the screen is shown (a splash waits, then shows the title) */
  onShow: ActionList.optional(),
  /** Esc / Android back while this is the top screen; default: pause screens close, the HUD opens Pause */
  onBack: ActionList.optional(),
});
export type Screen = z.infer<typeof Screen>;
