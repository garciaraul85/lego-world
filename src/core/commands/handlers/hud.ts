import { BUILTIN_SCREENS } from '../../../builtin/screens';
import { hudScreenFor } from '../../../builtin/screens/hud-styles';
import { HUD_STYLE_INFO, HUD_STYLES, type HudStyle } from '../../controls/hud-styles';
import { paths, type Screen, type Settings } from '../../schema';
import type { CommandHandler } from '../types';

/** the HUD screen a game plays with (the built-in one, or the project's own copy of it) */
const HUD_ID = 'scr_hud0000000';

export type ApplyHudStyle = { style: HudStyle | null };

/**
 * Milestone 3b (B7b): a HUD style applied — the buttons' layout and faces (Project › Controls) and the HUD screen
 * arranged like that era's games. null: the plain look and the built-in HUD again. Undo brings back what was.
 */
export const applyHudStyle: CommandHandler<ApplyHudStyle> = {
  label: (p) => (p.style ? `HUD style: ${HUD_STYLE_INFO[p.style].name}` : 'HUD style: plain'),
  validate: (_s, p) =>
    p.style === null || (HUD_STYLES as readonly string[]).includes(p.style)
      ? null
      : `HUD style: use ${HUD_STYLES.join(', ')} or null.`,
  apply(store, p) {
    const st = store.get<Settings>(paths.settings)!;
    const { hud: _h, items: _i, jump: _j, ...cur } = st.controls ?? { layout: 'modern' as const };
    const controls = p.style
      ? { ...cur, layout: HUD_STYLE_INFO[p.style].layout, hud: p.style }
      : { ...cur, layout: 'modern' as const };
    store.put(paths.settings, { ...st, controls });
    const base = BUILTIN_SCREENS.find((s) => s.id === HUD_ID) as Screen;
    if (p.style) store.put(paths.screen(HUD_ID), hudScreenFor(p.style, base));
    else if (store.get(paths.screen(HUD_ID))) store.remove(paths.screen(HUD_ID));
  },
};
