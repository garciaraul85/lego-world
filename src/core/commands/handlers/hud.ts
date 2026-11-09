import { BUILTIN_SCREENS } from '../../../builtin/screens';
import { hudScreenFor } from '../../../builtin/screens/hud-styles';
import { CustomHud, isCustomHudId, isEra, MAX_HUD_STYLES } from '../../controls/hud-custom';
import { HUD_STYLE_INFO, HUD_STYLES, type HudStyle } from '../../controls/hud-styles';
import { paths, type Screen, type Settings } from '../../schema';
import type { CommandHandler } from '../types';

/** the HUD screen a game plays with (the built-in one, or the project's own copy of it) */
const HUD_ID = 'scr_hud0000000';

export type ApplyHudStyle = { style: string };

/**
 * Milestone 3b (B7b): a HUD style applied — the buttons' layout and faces (Project › Controls) and the HUD screen
 * arranged like that era's games. v144: or a style of the maker's own (hudstyles/<id>.json), which takes its era's
 * arrangement. Undo brings back what was.
 */
export const applyHudStyle: CommandHandler<ApplyHudStyle> = {
  label: (p) => `HUD style: ${isEra(p.style) ? HUD_STYLE_INFO[p.style].name : 'your own'}`,
  validate(store, p) {
    if (isEra(p.style)) return null;
    if (isCustomHudId(p.style) && store.has(paths.hudStyle(p.style))) return null;
    return `HUD style: use ${HUD_STYLES.join(', ')} or the id of a style in hudstyles/.`;
  },
  apply(store, p) {
    const st = store.get<Settings>(paths.settings)!;
    const { hud: _h, items, jump, ...cur } = st.controls ?? { layout: 'modern' as const };
    const own = isEra(p.style) ? null : store.get<CustomHud>(paths.hudStyle(p.style))!;
    const layout = own ? own.layout : HUD_STYLE_INFO[p.style as HudStyle].layout;
    // a style of your own on the Custom layout keeps the game's item buttons and jumping
    const keep = layout === 'custom' ? { ...(items !== undefined ? { items } : {}), ...(jump ? { jump } : {}) } : {};
    store.put(paths.settings, { ...st, controls: { ...cur, ...keep, layout, hud: p.style } });
    const base = BUILTIN_SCREENS.find((s) => s.id === HUD_ID) as Screen;
    store.put(paths.screen(HUD_ID), hudScreenFor(own ? own.base : (p.style as HudStyle), base));
  },
};

/** v144: a HUD style of the maker's own, put whole (made, changed or renamed) */
export const putHudStyle: CommandHandler<{ style: CustomHud }> = {
  label: (p) => `HUD style ${p.style.name}`,
  validate(store, p) {
    const r = CustomHud.safeParse(p.style);
    if (!r.success) return `Not valid: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message ?? ''}`.trim();
    if (!Object.keys(p.style.faces).length) return 'A HUD style needs at least one button.';
    if (!store.has(paths.hudStyle(p.style.id)) && store.list(paths.hudStyleDir).length >= MAX_HUD_STYLES)
      return `A game holds at most ${MAX_HUD_STYLES} HUD styles of its own.`;
    return null;
  },
  apply: (store, p) => store.put(paths.hudStyle(p.style.id), CustomHud.parse(p.style)),
};

/** v144: a style of your own deleted; a game playing with it goes back to the open-air look */
export const deleteHudStyle: CommandHandler<{ id: string }> = {
  label: () => 'Delete HUD style',
  validate: (store, p) => (store.has(paths.hudStyle(p.id)) ? null : 'That HUD style is not in this game.'),
  apply(store, p) {
    store.remove(paths.hudStyle(p.id));
    const st = store.get<Settings>(paths.settings);
    if (st?.controls?.hud === p.id) {
      const { hud: _h, ...rest } = st.controls;
      store.put(paths.settings, { ...st, controls: rest });
    }
  },
};
