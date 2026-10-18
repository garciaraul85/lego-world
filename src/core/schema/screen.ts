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
  /** P31: a different place and look on portrait screens (taller than wide) */
  portrait?: { anchor?: [number, number]; offset?: [number, number]; style?: Record<string, string | number> };
  /** P31: placed next to another widget of the same screen (like Android constraints) */
  pin?: WidgetPin;
  /** P26: shown only while this value is on (a {binding} name such as save.any) */
  showIf?: string;
};

export type WidgetPin = {
  /** id of the widget it sits next to */
  to: string;
  side: 'below' | 'above' | 'left' | 'right';
  /** along the shared edge: start (left / top), center or end */
  align?: 'start' | 'center' | 'end';
  /** gap between the two, reference px */
  gap?: number;
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
    portrait: z
      .strictObject({
        anchor: Vec2.optional(),
        offset: Vec2.optional(),
        style: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      })
      .optional(),
    pin: z
      .strictObject({
        to: z.string().min(1),
        side: z.enum(['below', 'above', 'left', 'right']),
        align: z.enum(['start', 'center', 'end']).optional(),
        gap: z.number().min(-2000).max(2000).optional(),
      })
      .optional(),
    showIf: z.string().min(1).max(60).optional(),
  }),
);

/** screens/<screenId>.json — layout at a 1280x720 reference (720x1280 on portrait screens), anchors 0..1 of the parent */
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
